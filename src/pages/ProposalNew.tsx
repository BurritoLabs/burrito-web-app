import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type FormEvent
} from "react"
import { useQuery } from "@tanstack/react-query"
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate"
import { Registry } from "@cosmjs/proto-signing"
import { toUtf8 } from "@cosmjs/encoding"
import { MsgSubmitProposal } from "cosmjs-types/cosmos/gov/v1beta1/tx"
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov"
import { CommunityPoolSpendProposal } from "cosmjs-types/cosmos/distribution/v1beta1/distribution"
import {
  ParameterChangeProposal,
  ParamChange
} from "cosmjs-types/cosmos/params/v1beta1/params"
import { ExecuteContractProposal } from "cosmjs-types/cosmwasm/wasm/v1/proposal_legacy"
import PageShell from "./PageShell"
import styles from "./ProposalNew.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import {
  CLASSIC_CHAIN,
  CLASSIC_DENOMS,
  KEPLR_CHAIN_CONFIG
} from "../app/chain"
import { fetchDepositParams } from "../app/data/classic"
import { fetchBalances } from "../app/data/classic"

type ProposalType = "TEXT" | "SPEND" | "PARAMS" | "EXECUTE"

type ChangeItem = { subspace: string; key: string; value: string }

type CoinInput = { denom: string; amount: string }

const DENOMS = [
  CLASSIC_DENOMS.lunc.coinMinimalDenom,
  CLASSIC_DENOMS.ustc.coinMinimalDenom
]

const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

const getWalletInstance = () => {
  if (typeof window === "undefined") return undefined
  const anyWindow = window as Window & {
    keplr?: any
    station?: any
    galaxyStation?: any
    getOfflineSigner?: any
    getOfflineSignerAuto?: any
  }
  return anyWindow.keplr ?? anyWindow.station ?? anyWindow.galaxyStation
}

const getOfflineSigner = async () => {
  if (typeof window === "undefined") return undefined
  const anyWindow = window as Window & {
    getOfflineSigner?: any
    getOfflineSignerAuto?: any
  }
  if (anyWindow.getOfflineSignerAuto) {
    return await anyWindow.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (anyWindow.getOfflineSigner) {
    return anyWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  return undefined
}

const ProposalNew = () => {
  const { account } = useWallet()
  const [proposalType, setProposalType] = useState<ProposalType>("TEXT")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [deposit, setDeposit] = useState("")
  const [spendRecipient, setSpendRecipient] = useState("")
  const [spendAmount, setSpendAmount] = useState("")
  const [spendDenom, setSpendDenom] = useState(DENOMS[0])
  const [changes, setChanges] = useState<ChangeItem[]>([
    { subspace: "", key: "", value: "" }
  ])
  const [runAs, setRunAs] = useState("")
  const [contractAddress, setContractAddress] = useState("")
  const [executeMsg, setExecuteMsg] = useState("{}")
  const [funds, setFunds] = useState<CoinInput[]>([
    { denom: DENOMS[0], amount: "" }
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [txHash, setTxHash] = useState("")
  const [typeOpen, setTypeOpen] = useState(false)
  const typeRef = useRef<HTMLDivElement | null>(null)
  const [feeEstimate, setFeeEstimate] = useState<{
    gasUsed: number
    feeAmount: string
  } | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()

  const { data: depositParams } = useQuery({
    queryKey: ["govDepositParams"],
    queryFn: fetchDepositParams,
    staleTime: 5 * 60 * 1000
  })

  const { data: balances = [] } = useQuery({
    queryKey: ["balances", account?.address],
    queryFn: () => fetchBalances(account?.address ?? ""),
    enabled: !!account?.address
  })

  const minDeposit = useMemo(() => {
    const min = depositParams?.minDeposit?.find(
      (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    if (!min?.amount) return ""
    return (Number(min.amount) / 1_000_000).toFixed(0)
  }, [depositParams])

  const proposalTypeOptions = useMemo(
    () => [
      { value: "TEXT" as const, label: "Text proposal" },
      { value: "SPEND" as const, label: "Community pool spend" },
      { value: "PARAMS" as const, label: "Parameter change" },
      { value: "EXECUTE" as const, label: "Execute contract" }
    ],
    []
  )

  const currentProposalTypeLabel =
    proposalTypeOptions.find((option) => option.value === proposalType)?.label ??
    "Text proposal"

  const luncBalance = useMemo(() => {
    const item = balances.find(
      (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    return item?.amount ?? "0"
  }, [balances])

  const validateAddress = (value: string) =>
    /^terra1[0-9a-z]{38}$/.test(value)

  const getRegistry = () => {
    const registry = new Registry()
    registry.register("/cosmos.gov.v1beta1.MsgSubmitProposal", MsgSubmitProposal as any)
    registry.register(TextProposal.typeUrl, TextProposal as any)
    registry.register(
      CommunityPoolSpendProposal.typeUrl,
      CommunityPoolSpendProposal as any
    )
    registry.register(ParameterChangeProposal.typeUrl, ParameterChangeProposal as any)
    registry.register(ExecuteContractProposal.typeUrl, ExecuteContractProposal as any)
    return registry
  }

  const buildContent = () => {
    if (proposalType === "SPEND") {
      const value = CommunityPoolSpendProposal.fromPartial({
        title,
        description,
        recipient: spendRecipient,
        amount: [{ denom: spendDenom, amount: toMicroAmount(spendAmount) }]
      })
      return { typeUrl: CommunityPoolSpendProposal.typeUrl, value }
    }
    if (proposalType === "PARAMS") {
      const value = ParameterChangeProposal.fromPartial({
        title,
        description,
        changes: changes.map((item) =>
          ParamChange.fromPartial({
            subspace: item.subspace,
            key: item.key,
            value: item.value
          })
        )
      })
      return { typeUrl: ParameterChangeProposal.typeUrl, value }
    }
    if (proposalType === "EXECUTE") {
      const msgJson = JSON.parse(executeMsg)
      const parsedFunds = funds
        .filter((item) => Number(item.amount))
        .map((item) => ({
          denom: item.denom,
          amount: toMicroAmount(item.amount)
        }))
      const value = ExecuteContractProposal.fromPartial({
        title,
        description,
        runAs,
        contract: contractAddress,
        msg: toUtf8(JSON.stringify(msgJson)),
        funds: parsedFunds
      })
      return { typeUrl: ExecuteContractProposal.typeUrl, value }
    }
    const value = TextProposal.fromPartial({
      title,
      description
    })
    return { typeUrl: TextProposal.typeUrl, value }
  }

  const buildMsg = (registry: Registry) => {
    const content = buildContent()
    const initialDeposit = Number(deposit)
      ? [
          {
            denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
            amount: toMicroAmount(deposit)
          }
        ]
      : []

    return {
      typeUrl: "/cosmos.gov.v1beta1.MsgSubmitProposal",
        value: MsgSubmitProposal.fromPartial({
          content: registry.encodeAsAny(content as any),
        initialDeposit,
        proposer: account?.address ?? ""
      })
    }
  }

  const canEstimateFee = useMemo(() => {
    if (!account?.address) return false
    if (!title.trim() || !description.trim()) return false
    if (proposalType === "SPEND") {
      return validateAddress(spendRecipient) && Number(spendAmount) > 0
    }
    if (proposalType === "PARAMS") {
      return changes.every(
        (item) => item.subspace && item.key && item.value !== ""
      )
    }
    if (proposalType === "EXECUTE") {
      if (!validateAddress(runAs) || !validateAddress(contractAddress)) return false
      try {
        JSON.parse(executeMsg)
      } catch {
        return false
      }
    }
    return true
  }, [
    account?.address,
    title,
    description,
    proposalType,
    spendRecipient,
    spendAmount,
    changes,
    runAs,
    contractAddress,
    executeMsg,
    validateAddress
  ])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    if (!canEstimateFee) {
      setFeeEstimate(null)
      setFeeError(undefined)
      return undefined
    }

    timer = window.setTimeout(async () => {
      setFeeLoading(true)
      setFeeError(undefined)
      try {
        const wallet = getWalletInstance()
        if (!wallet) throw new Error("Wallet extension not available")
        if (wallet.experimentalSuggestChain) {
          await wallet.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
        }
        if (wallet.enable) {
          await wallet.enable(KEPLR_CHAIN_CONFIG.chainId)
        }
        const signer = await getOfflineSigner()
        if (!signer) throw new Error("Wallet signer not available")
        const registry = getRegistry()
        const msg = buildMsg(registry)
        const client = await SigningStargateClient.connectWithSigner(
          CLASSIC_CHAIN.rpc,
          signer,
          {
            registry,
            gasPrice: GasPrice.fromString("28.325uluna")
          }
        )
        const gasUsed = await client.simulate(account?.address ?? "", [msg], "")
        const gasPrice = GasPrice.fromString("28.325uluna")
        const gasPriceAmount = Number(gasPrice.amount.toString())
        const feeMicro = Math.ceil(gasUsed * gasPriceAmount).toString()
        if (!cancelled) {
          setFeeEstimate({ gasUsed, feeAmount: feeMicro })
        }
      } catch (err) {
        if (!cancelled) {
          setFeeEstimate(null)
          setFeeError(err instanceof Error ? err.message : "Fee estimation failed")
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 600)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [
    canEstimateFee,
    proposalType,
    title,
    description,
    deposit,
    spendRecipient,
    spendAmount,
    spendDenom,
    changes,
    runAs,
    contractAddress,
    executeMsg,
    funds,
    account?.address
  ])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!typeRef.current) return
      if (!typeRef.current.contains(event.target as Node)) {
        setTypeOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [])

  const formatMicro = (amount: string | bigint) => {
    const value = typeof amount === "bigint" ? amount : BigInt(amount)
    const negative = value < 0n
    const abs = negative ? -value : value
    const whole = abs / 1_000_000n
    const frac = abs % 1_000_000n
    return `${negative ? "-" : ""}${whole.toString()}.${frac
      .toString()
      .padStart(6, "0")}`
  }

  const depositMicro = useMemo(() => {
    return Number(deposit) ? BigInt(toMicroAmount(deposit)) : 0n
  }, [deposit])

  const feeMicro = feeEstimate ? BigInt(feeEstimate.feeAmount) : 0n
  const balanceMicro = BigInt(luncBalance || "0")
  const maxSpendable = balanceMicro > feeMicro ? balanceMicro - feeMicro : 0n
  const balanceAfter = balanceMicro - depositMicro - feeMicro

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || !account?.address) return
    setError(undefined)
    setTxHash("")
    if (!account?.address) {
      setError("Please connect a wallet.")
      return
    }
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.")
      return
    }
    if (proposalType === "SPEND") {
      if (!validateAddress(spendRecipient)) {
        setError("Recipient address is invalid.")
        return
      }
      if (!Number(spendAmount)) {
        setError("Spend amount is required.")
        return
      }
    }
    if (proposalType === "PARAMS") {
      const invalid = changes.some(
        (item) => !item.subspace || !item.key || item.value === ""
      )
      if (invalid) {
        setError("All parameter change fields are required.")
        return
      }
    }
    if (proposalType === "EXECUTE") {
      if (!validateAddress(runAs) || !validateAddress(contractAddress)) {
        setError("Run as / contract address is invalid.")
        return
      }
      try {
        JSON.parse(executeMsg)
      } catch {
        setError("Execute msg must be valid JSON.")
        return
      }
    }

    try {
      setSubmitting(true)
      const wallet = getWalletInstance()
      if (!wallet) throw new Error("Wallet extension not available")
      if (wallet.experimentalSuggestChain) {
        await wallet.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
      }
      if (wallet.enable) {
        await wallet.enable(KEPLR_CHAIN_CONFIG.chainId)
      }
      const signer = await getOfflineSigner()
      if (!signer) throw new Error("Wallet signer not available")

      const registry = getRegistry()

      const msg = buildMsg(registry)

      const client = await SigningStargateClient.connectWithSigner(
        CLASSIC_CHAIN.rpc,
        signer,
        {
          registry,
          gasPrice: GasPrice.fromString("28.325uluna")
        }
      )
      const result = await client.signAndBroadcast(account.address, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      setTxHash(result.transactionHash)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell title="New proposal" backTo="/gov" backLabel="">
      <div className={styles.container}>
        <form className={`card ${styles.inputCard} ${styles.form}`} onSubmit={submit}>
          <div className={styles.noticeWarning}>
            Proposal deposits will not be refunded if the proposal is vetoed, fails to meet
            quorum, or does not meet the minimum deposit.
          </div>
          {proposalType === "TEXT" ? (
            <div className={styles.noticeWarning}>Parameters cannot be changed by text proposals.</div>
          ) : null}

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <span className={styles.label} id="proposal-type-label">
                Proposal type
              </span>
              <div className={styles.selectWrapper} ref={typeRef}>
                <button
                  className={styles.selectButton}
                  type="button"
                  aria-labelledby="proposal-type-label"
                  aria-haspopup="listbox"
                  aria-expanded={typeOpen}
                  onClick={() => setTypeOpen((open) => !open)}
                >
                  <span>{currentProposalTypeLabel}</span>
                  <span className={styles.selectChevron} aria-hidden="true" />
                </button>
                {typeOpen ? (
                  <div className={styles.selectMenu} role="listbox">
                    {proposalTypeOptions.map((option) => {
                      const active = option.value === proposalType
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`${styles.selectOption} ${
                            active ? styles.selectOptionActive : ""
                          }`}
                          onMouseDown={(event) => {
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.stopPropagation()
                            setProposalType(option.value)
                            setTypeOpen(false)
                          }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Title</span>
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Burn community pool"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Description</span>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="We're proposing to spend 100,000 LUNC from the Community Pool to fund the creation of public goods for the Terra Classic ecosystem."
                rows={6}
              />
            </label>

            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <label className={styles.label} htmlFor="initial-deposit-input">
                  Initial deposit (optional)
                  <span
                    className={styles.tooltipIcon}
                    data-tooltip={`To help push the proposal to the voting period, consider depositing more LUNC to reach the minimum ${minDeposit || "--"} LUNC (optional).`}
                    aria-label="Initial deposit info"
                  >
                    ?
                  </span>
                </label>
                {account?.address ? (
                  <button
                    type="button"
                    className={styles.maxButton}
                    onClick={() => {
                      const text = formatMicro(maxSpendable).replace(/\.?0+$/, "")
                      setDeposit(text || "0")
                    }}
                  >
                    <svg
                      className={styles.maxIcon}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 7.5h16a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-9a0.5 0.5 0 0 1 0.5-0.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 7.5V6a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <circle cx="17.5" cy="13" r="1.5" fill="currentColor" />
                    </svg>
                    <span>{formatMicro(maxSpendable)} LUNC</span>
                  </button>
                ) : null}
              </div>
              <div className={styles.inputWithSuffix}>
                <input
                  className={`${styles.input} ${styles.inputHasSuffix} ${styles.numberInput}`}
                  id="initial-deposit-input"
                  value={deposit}
                  onChange={(event) => {
                    setDeposit(event.target.value)
                  }}
                  placeholder=""
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                />
                <span className={styles.suffix}>LUNC</span>
              </div>
            </div>
          </div>

          {proposalType === "SPEND" ? (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Community pool spend</div>
              <div className={styles.sectionGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Recipient</span>
                  <input
                    className={styles.input}
                    value={spendRecipient}
                    onChange={(event) => setSpendRecipient(event.target.value)}
                    placeholder="terra..."
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Amount</span>
                  <div className={styles.inline}>
                    <input
                      className={styles.input}
                      value={spendAmount}
                      onChange={(event) => setSpendAmount(event.target.value)}
                      type="number"
                      min="0"
                      step="0.000001"
                    />
                    <select
                      className={styles.input}
                      value={spendDenom}
                    onChange={(event) =>
                      setSpendDenom(event.target.value as (typeof DENOMS)[number])
                    }
                    >
                      {DENOMS.map((denom) => (
                        <option key={denom} value={denom}>
                          {denom === "uluna" ? "LUNC" : "USTC"}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            </div>
          ) : null}

          {proposalType === "PARAMS" ? (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Parameter changes</div>
              <div className={styles.sectionStack}>
                {changes.map((item, index) => (
                  <div key={index} className={styles.changeRow}>
                    <input
                      className={styles.input}
                      value={item.subspace}
                      onChange={(event) => {
                        const next = [...changes]
                        next[index] = { ...next[index], subspace: event.target.value }
                        setChanges(next)
                      }}
                      placeholder="subspace"
                    />
                    <input
                      className={styles.input}
                      value={item.key}
                      onChange={(event) => {
                        const next = [...changes]
                        next[index] = { ...next[index], key: event.target.value }
                        setChanges(next)
                      }}
                      placeholder="key"
                    />
                    <input
                      className={styles.input}
                      value={item.value}
                      onChange={(event) => {
                        const next = [...changes]
                        next[index] = { ...next[index], value: event.target.value }
                        setChanges(next)
                      }}
                      placeholder="value"
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => {
                        const next = [...changes]
                        next.splice(index, 1)
                        setChanges(next.length ? next : [{ subspace: "", key: "", value: "" }])
                      }}
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    setChanges([...changes, { subspace: "", key: "", value: "" }])
                  }
                >
                  Add change
                </button>
              </div>
            </div>
          ) : null}

          {proposalType === "EXECUTE" ? (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Execute contract</div>
              <div className={styles.sectionGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Run as</span>
                  <input
                    className={styles.input}
                    value={runAs}
                    onChange={(event) => setRunAs(event.target.value)}
                    placeholder="terra..."
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Contract address</span>
                  <input
                    className={styles.input}
                    value={contractAddress}
                    onChange={(event) => setContractAddress(event.target.value)}
                    placeholder="terra..."
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Execute msg (JSON)</span>
                  <textarea
                    className={styles.textarea}
                    value={executeMsg}
                    onChange={(event) => setExecuteMsg(event.target.value)}
                    rows={6}
                  />
                </label>
              </div>
              <div className={styles.sectionStack}>
                <div className={styles.sectionTitle}>Funds</div>
                {funds.map((item, index) => (
                  <div key={index} className={styles.changeRow}>
                    <input
                      className={styles.input}
                      value={item.amount}
                      onChange={(event) => {
                        const next = [...funds]
                        next[index] = { ...next[index], amount: event.target.value }
                        setFunds(next)
                      }}
                      type="number"
                      min="0"
                      step="0.000001"
                      placeholder="amount"
                    />
                    <select
                      className={styles.input}
                      value={item.denom}
                      onChange={(event) => {
                        const next = [...funds]
                        next[index] = {
                          ...next[index],
                          denom: event.target.value as (typeof DENOMS)[number]
                        }
                        setFunds(next)
                      }}
                    >
                      {DENOMS.map((denom) => (
                        <option key={denom} value={denom}>
                          {denom === "uluna" ? "LUNC" : "USTC"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => {
                        const next = [...funds]
                        next.splice(index, 1)
                        setFunds(next.length ? next : [{ denom: DENOMS[0], amount: "" }])
                      }}
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setFunds([...funds, { denom: DENOMS[0], amount: "" }])}
                >
                  Add fund
                </button>
              </div>
            </div>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}
          {txHash ? (
            <div className={styles.success}>
              Submitted. Tx: <a href={`https://finder.burrito.money/classic/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
            </div>
          ) : null}

          {account?.address ? (
            <div className={styles.feeCard}>
              <dl>
                <dt>Fee</dt>
                <dd>
                  {feeLoading
                    ? "Estimating..."
                    : feeEstimate
                    ? `${formatMicro(feeEstimate.feeAmount)} LUNC`
                    : "--"}
                </dd>
                <dt>Balance</dt>
                <dd>{formatMicro(balanceMicro)} LUNC</dd>
                <dt>Balance after tx</dt>
                <dd>{formatMicro(balanceAfter)} LUNC</dd>
              </dl>
              {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
            </div>
          ) : null}
          <div className={styles.actions}>
            <button
              className={`uiButton uiButtonPrimary ${styles.submitButton}`}
              type="submit"
              disabled={submitting || !account?.address}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  )
}

export default ProposalNew
