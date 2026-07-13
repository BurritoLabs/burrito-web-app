import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type FormEvent
} from "react"
import { useQuery } from "@tanstack/react-query"
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate"
import type {
  EncodeObject,
  GeneratedType,
  } from "@cosmjs/proto-signing"
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
import PageShell from "../PageShell"
import styles from "../ProposalNew.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import { fetchDepositParams } from "../../app/data/classic"
import { fetchBalances } from "../../app/data/classic"
import { getOfflineSignerForConnector } from "../../app/wallet/walletAdapters"
import { formatTxError } from "../../app/utils/txError"
import { useAppChain } from "../../app/appChainContext"

type ProposalType = "TEXT" | "SPEND" | "PARAMS" | "EXECUTE"

type ChangeItem = { subspace: string; key: string; value: string }

type CoinInput = { denom: string; amount: string }

const PROPOSAL_GAS_ADJUSTMENT = 1.6
const FALLBACK_GAS = 350_000
const SIMULATION_FALLBACK_GAS_MULTIPLIER = 1.35

const buildEstimatedFee = (gasUsed: number, gasPriceMicro: number) => {
  const gasWanted = Math.ceil(gasUsed * PROPOSAL_GAS_ADJUSTMENT)
  const feeAmount = Math.max(1, Math.ceil(gasWanted * gasPriceMicro)).toString()
  return { gasUsed, gasWanted, feeAmount }
}

const estimateFallbackFee = (gasPriceMicro: number) =>
  buildEstimatedFee(FALLBACK_GAS, gasPriceMicro)

const estimateSubmitFee = async (
  client: SigningStargateClient,
  signerAddress: string,
  messages: Parameters<SigningStargateClient["simulate"]>[1],
  gasPriceMicro: number
) => {
  try {
    const simulatedGas = await client.simulate(signerAddress, messages, "")
    return buildEstimatedFee(Math.max(simulatedGas, FALLBACK_GAS), gasPriceMicro)
  } catch {
    return buildEstimatedFee(
      Math.ceil(FALLBACK_GAS * SIMULATION_FALLBACK_GAS_MULTIPLIER),
      gasPriceMicro
    )
  }
}

const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

const isTerraAddress = (value: string) => /^terra1[0-9a-z]{38}$/.test(value)

const ProposalNew = () => {
  const { chain, chainKey } = useAppChain()
  const nativeDenom = chain.runtime.nativeDenom.coinMinimalDenom
  const nativeSymbol = chain.displayDenom
  const denoms = chain.runtime.feeDenoms.map((denom) => denom.coinMinimalDenom)
  const feeDenomOptions = denoms
  const secondaryDenom = chainKey === "lunc" ? "uusd" : undefined
  const gasPriceMicro = chain.runtime.gasPriceStep.average
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const [proposalType, setProposalType] = useState<ProposalType>("TEXT")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [deposit, setDeposit] = useState("")
  const [spendRecipient, setSpendRecipient] = useState("")
  const [spendAmount, setSpendAmount] = useState("")
  const [spendDenom, setSpendDenom] = useState<string>(nativeDenom)
  const [changes, setChanges] = useState<ChangeItem[]>([
    { subspace: "", key: "", value: "" }
  ])
  const [runAs, setRunAs] = useState("")
  const [contractAddress, setContractAddress] = useState("")
  const [executeMsg, setExecuteMsg] = useState("{}")
  const [funds, setFunds] = useState<CoinInput[]>([
    { denom: nativeDenom, amount: "" }
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [txHash, setTxHash] = useState("")
  const [typeOpen, setTypeOpen] = useState(false)
  const typeRef = useRef<HTMLDivElement | null>(null)
  const [feeDenom, setFeeDenom] = useState<string>(nativeDenom)
  const [feeOpen, setFeeOpen] = useState(false)
  const feeRef = useRef<HTMLDivElement | null>(null)
  const [feeEstimate, setFeeEstimate] = useState<{
    gasUsed: number
    gasWanted: number
    feeAmount: string
  } | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()

  const { data: depositParams } = useQuery({
    queryKey: ["govDepositParams", chain.chainId],
    queryFn: fetchDepositParams,
    staleTime: 5 * 60 * 1000
  })

  const { data: balances = [] } = useQuery({
    queryKey: ["balances", chain.chainId, account?.address],
    queryFn: () => fetchBalances(account?.address ?? ""),
    enabled: !!account?.address
  })

  const minDeposit = useMemo(() => {
    const min = depositParams?.minDeposit?.find(
      (coin) => coin.denom === nativeDenom
    )
    if (!min?.amount) return ""
    return (Number(min.amount) / 1_000_000).toFixed(0)
  }, [depositParams, nativeDenom])

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
      (coin) => coin.denom === nativeDenom
    )
    return item?.amount ?? "0"
  }, [balances, nativeDenom])

  const ustcBalance = useMemo(() => {
    const item = balances.find(
      (coin) => coin.denom === secondaryDenom
    )
    return item?.amount ?? "0"
  }, [balances, secondaryDenom])

  const getDenomLabel = (denom: string) =>
    denom === nativeDenom ? nativeSymbol : denom === "uusd" ? "USTC" : denom

  useEffect(() => {
    setSpendDenom(nativeDenom)
    setFunds([{ denom: nativeDenom, amount: "" }])
    setFeeDenom(nativeDenom)
  }, [chain.chainId, nativeDenom])

  const getRegistry = () => {
    const registry = new Registry()
    registry.register(
      "/cosmos.gov.v1beta1.MsgSubmitProposal",
      MsgSubmitProposal as GeneratedType
    )
    registry.register(TextProposal.typeUrl, TextProposal as GeneratedType)
    registry.register(
      CommunityPoolSpendProposal.typeUrl,
      CommunityPoolSpendProposal as GeneratedType
    )
    registry.register(
      ParameterChangeProposal.typeUrl,
      ParameterChangeProposal as GeneratedType
    )
    registry.register(
      ExecuteContractProposal.typeUrl,
      ExecuteContractProposal as GeneratedType
    )
    return registry
  }

  const buildContent = (): EncodeObject => {
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
      const msgJson = JSON.parse(executeMsg) as Record<string, unknown>
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

  const buildMsg = (registry: Registry, proposer: string) => {
    const content = buildContent()
    const initialDeposit = Number(deposit)
      ? [
          {
            denom: nativeDenom,
            amount: toMicroAmount(deposit)
          }
        ]
      : []

    return {
      typeUrl: "/cosmos.gov.v1beta1.MsgSubmitProposal",
      value: MsgSubmitProposal.fromPartial({
        content: registry.encodeAsAny(content),
        initialDeposit,
        proposer
      })
    }
  }

  const canEstimateFee = useMemo(() => {
    if (!account?.address) return false
    if (!title.trim() || !description.trim()) return false
    if (proposalType === "SPEND") {
      return isTerraAddress(spendRecipient) && Number(spendAmount) > 0
    }
    if (proposalType === "PARAMS") {
      return changes.every(
        (item) => item.subspace && item.key && item.value !== ""
      )
    }
    if (proposalType === "EXECUTE") {
      if (!isTerraAddress(runAs) || !isTerraAddress(contractAddress)) return false
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
    executeMsg
  ])

  useEffect(() => {
    if (!account?.address) {
      setFeeEstimate(null)
      setFeeError(undefined)
      setFeeLoading(false)
      return
    }

    // Keep fee behavior stable and close to Station page behavior.
    setFeeLoading(false)
    setFeeError(undefined)
    setFeeEstimate(estimateFallbackFee(gasPriceMicro))
  }, [account?.address, chain.chainId, feeDenom, gasPriceMicro])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (typeRef.current && !typeRef.current.contains(target)) {
        setTypeOpen(false)
      }
      if (feeRef.current && !feeRef.current.contains(target)) {
        setFeeOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTypeOpen(false)
        setFeeOpen(false)
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
  const luncBalanceMicro = BigInt(luncBalance || "0")
  const ustcBalanceMicro = BigInt(ustcBalance || "0")
  const maxSpendable =
    feeDenom === nativeDenom
      ? luncBalanceMicro > feeMicro
        ? luncBalanceMicro - feeMicro
        : 0n
      : luncBalanceMicro
  const luncAfterTx =
    luncBalanceMicro -
    depositMicro -
    (feeDenom === nativeDenom ? feeMicro : 0n)
  const ustcAfterTx =
    ustcBalanceMicro -
    (secondaryDenom && feeDenom === secondaryDenom ? feeMicro : 0n)
  const hasBalanceError =
    depositMicro > luncBalanceMicro ||
    (feeDenom === nativeDenom && luncAfterTx < 0n) ||
    (secondaryDenom === feeDenom && ustcAfterTx < 0n)
  const canSubmit =
    !!account?.address &&
    canEstimateFee &&
    !!feeEstimate &&
    !submitting &&
    !feeLoading &&
    !hasBalanceError

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || !account?.address || !canSubmit) return
    setError(undefined)
    setTxHash("")
    if (!account?.address) {
      setError("Please connect a wallet.")
      return
    }
    if (!feeEstimate) {
      setError("Fee estimation failed.")
      return
    }
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.")
      return
    }
    if (depositMicro > luncBalanceMicro) {
      setError(`Initial deposit exceeds ${nativeSymbol} balance.`)
      return
    }
    if (
      feeDenom === nativeDenom &&
      luncAfterTx < 0n
    ) {
      setError(`Insufficient ${nativeSymbol} balance for deposit + fee.`)
      return
    }
    if (
      secondaryDenom === feeDenom &&
      ustcAfterTx < 0n
    ) {
      setError("Insufficient USTC balance for fee.")
      return
    }
    if (proposalType === "SPEND") {
      if (!isTerraAddress(spendRecipient)) {
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
      if (!isTerraAddress(runAs) || !isTerraAddress(contractAddress)) {
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
      startTx("Submit proposal")
      if (!connectorId) throw new Error("Wallet not connected")
      const signer = await getOfflineSignerForConnector(connectorId)
      const signerAccount = (await signer.getAccounts())[0]
      if (!signerAccount?.address) {
        throw new Error("Wallet account unavailable")
      }
      const signerAddress = signerAccount.address

      const registry = getRegistry()

      const msg = buildMsg(registry, signerAddress)

      const client = await SigningStargateClient.connectWithSigner(
        chain.runtime.chain.rpc,
        signer,
        {
          registry,
          gasPrice: GasPrice.fromString(`${gasPriceMicro}${feeDenom}`)
        }
      )
      const finalFee = await estimateSubmitFee(
        client,
        signerAddress,
        [msg],
        gasPriceMicro
      )
      const result = await client.signAndBroadcast(signerAddress, [msg], {
        amount: [{ amount: finalFee.feeAmount, denom: feeDenom }],
        gas: String(finalFee.gasWanted)
      })
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      setTxHash(result.transactionHash)
      finishTx(result.transactionHash)
    } catch (err) {
      const message = formatTxError(err, "Submission failed")
      failTx(message)
      setError(message)
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
                placeholder={`We're proposing to spend 100,000 ${nativeSymbol} from the Community Pool to fund public goods for the ${chain.name} ecosystem.`}
                rows={6}
              />
            </label>

            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <label className={styles.label} htmlFor="initial-deposit-input">
                  Initial deposit (optional)
                  <span
                    className={styles.tooltipIcon}
                    data-tooltip={`To help push the proposal to the voting period, consider depositing more ${nativeSymbol} to reach the minimum ${minDeposit || "--"} ${nativeSymbol} (optional).`}
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
                    <span>{formatMicro(maxSpendable)} {nativeSymbol}</span>
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
                <span className={styles.suffix}>{nativeSymbol}</span>
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
                      setSpendDenom(event.target.value)
                    }
                    >
                      {denoms.map((denom) => (
                        <option key={denom} value={denom}>
                          {getDenomLabel(denom)}
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
                          denom: event.target.value
                        }
                        setFunds(next)
                      }}
                    >
                      {denoms.map((denom) => (
                        <option key={denom} value={denom}>
                          {getDenomLabel(denom)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => {
                        const next = [...funds]
                        next.splice(index, 1)
                        setFunds(next.length ? next : [{ denom: nativeDenom, amount: "" }])
                      }}
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setFunds([...funds, { denom: nativeDenom, amount: "" }])}
                >
                  Add fund
                </button>
              </div>
            </div>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}
          {txHash ? (
            <div className={styles.success}>
              Submitted. Tx: <a href={chainKey === "lunc" ? `https://finder.burrito.money/classic/tx/${txHash}` : `https://www.mintscan.io/terra/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
            </div>
          ) : null}

          {account?.address ? (
            <div className={styles.feeCard}>
              <div className={styles.feeTopRow}>
                <div className={styles.feeTopLeft}>
                  <span className={styles.feeTopLabel}>Fee</span>
                  <div className={styles.feeSelectWrapper} ref={feeRef}>
                    <button
                      type="button"
                      className={styles.feeSelectButton}
                      aria-haspopup="listbox"
                      aria-expanded={feeOpen}
                      onClick={() => setFeeOpen((open) => !open)}
                    >
                      <span>{getDenomLabel(feeDenom)}</span>
                      <span className={styles.selectChevron} aria-hidden="true" />
                    </button>
                    {feeOpen ? (
                      <div className={styles.feeSelectMenu} role="listbox">
                        {feeDenomOptions.map((denom) => {
                          const active = denom === feeDenom
                          return (
                            <button
                              key={denom}
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`${styles.feeSelectOption} ${
                                active ? styles.feeSelectOptionActive : ""
                              }`}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation()
                                setFeeDenom(denom)
                                setFeeOpen(false)
                              }}
                            >
                              {getDenomLabel(denom)}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={styles.feeTopAmount}>
                  {feeLoading
                    ? "Estimating..."
                    : feeEstimate
                    ? `${formatMicro(feeEstimate.feeAmount)} ${getDenomLabel(feeDenom)}`
                    : "--"}
                </div>
              </div>
              <dl>
                <dt>Balance</dt>
                <dd>
                  {formatMicro(luncBalanceMicro)} {nativeSymbol}
                </dd>
                <dt>Balance after tx</dt>
                <dd className={luncAfterTx < 0n ? styles.feeNegative : ""}>
                  {formatMicro(luncAfterTx)} {nativeSymbol}
                </dd>
              </dl>
              {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
            </div>
          ) : null}
          <div className={styles.actions}>
            <button
              className={`uiButton uiButtonPrimary ${styles.submitButton}`}
              type="submit"
              disabled={!canSubmit}
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
