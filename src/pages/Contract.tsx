import { useMemo, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toUtf8 } from "@cosmjs/encoding"
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate"
import {
  MsgInstantiateContract,
  MsgStoreCode
} from "cosmjs-types/cosmwasm/wasm/v1/tx"
import PageShell from "./PageShell"
import styles from "./Contract.module.css"
import {
  fetchContractInfo,
  fetchContractInitMsg,
  queryContractSmart
} from "../app/data/classic"
import { CLASSIC_CHAIN, CLASSIC_DENOMS, KEPLR_CHAIN_CONFIG } from "../app/chain"
import { truncateHash } from "../app/utils/format"
import { useWallet } from "../app/wallet/WalletProvider"

type IconProps = {
  className?: string
}

const CLOSE_ICON = (
  <>
    <span />
    <span />
  </>
)

const DEFAULT_QUERY = '{\n  "token_info": {}\n}'
const DEFAULT_INSTANTIATE_MSG = '{\n  "count": 0\n}'
const GAS_PRICE_MICRO = 28.325

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

const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

const extractEventAttr = (
  events:
    | ReadonlyArray<{
        type: string
        attributes: ReadonlyArray<{ key: string; value: string }>
      }>
    | undefined,
  keys: string[]
) => {
  if (!events?.length) return undefined
  for (const event of events) {
    for (const attr of event.attributes ?? []) {
      if (keys.includes(attr.key)) return attr.value
    }
  }
  return undefined
}

const SearchIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" className={className}>
    <circle
      cx="11"
      cy="11"
      r="6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M16.5 16.5L21 21"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const LinkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={className}>
    <path
      d="M8 16L16.5 7.5M10 7H17V14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FinderAddressLink = ({
  address,
  className
}: {
  address: string
  className?: string
}) => (
  <a
    className={`${styles.addressLink} ${className ?? ""}`.trim()}
    href={`https://finder.burrito.money/classic/address/${address}`}
    target="_blank"
    rel="noreferrer"
  >
    <span className={styles.addressLinkText}>{truncateHash(address)}</span>
    <LinkIcon />
  </a>
)

const Contract = () => {
  const { account, startTx, finishTx, failTx } = useWallet()
  const [address, setAddress] = useState("")
  const [queryOpen, setQueryOpen] = useState(false)
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY)
  const [queryLocalError, setQueryLocalError] = useState<string>()
  const [txModal, setTxModal] = useState<"upload" | "instantiate" | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSubmitting, setUploadSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string>()
  const [uploadHash, setUploadHash] = useState("")
  const [uploadCodeId, setUploadCodeId] = useState("")
  const [instantiateCodeId, setInstantiateCodeId] = useState("")
  const [instantiateLabel, setInstantiateLabel] = useState("")
  const [instantiateAdmin, setInstantiateAdmin] = useState("")
  const [instantiateMsg, setInstantiateMsg] = useState(DEFAULT_INSTANTIATE_MSG)
  const [instantiateFunds, setInstantiateFunds] = useState("")
  const [instantiateFundsDenom, setInstantiateFundsDenom] = useState<string>(
    CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const [instantiateSubmitting, setInstantiateSubmitting] = useState(false)
  const [instantiateError, setInstantiateError] = useState<string>()
  const [instantiateHash, setInstantiateHash] = useState("")
  const [instantiateAddress, setInstantiateAddress] = useState("")
  const hasAddress = address.trim().length > 0
  const trimmedAddress = address.trim()
  const isValidAddress = useMemo(
    () => /^terra1[0-9a-z]{38}$/.test(trimmedAddress),
    [trimmedAddress]
  )

  const {
    data: contract,
    isLoading: contractLoading,
    isError: contractError
  } = useQuery({
    queryKey: ["contract", trimmedAddress],
    queryFn: () => fetchContractInfo(trimmedAddress),
    enabled: isValidAddress,
    retry: false
  })

  const { data: initMsg, isLoading: initMsgLoading } = useQuery({
    queryKey: ["contract-init-msg", trimmedAddress],
    queryFn: async () => {
      try {
        return await fetchContractInitMsg(trimmedAddress)
      } catch {
        return null
      }
    },
    enabled: isValidAddress
  })

  const queryMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      queryContractSmart(trimmedAddress, payload)
  })

  const initMsgText = useMemo(() => {
    if (initMsgLoading) return "Loading..."
    if (!initMsg) return "--"
    try {
      return JSON.stringify(initMsg, null, 2)
    } catch {
      return String(initMsg)
    }
  }, [initMsg, initMsgLoading])

  const queryOutputText = useMemo(() => {
    if (queryMutation.data === undefined) return ""
    try {
      return JSON.stringify(queryMutation.data, null, 2)
    } catch {
      return String(queryMutation.data)
    }
  }, [queryMutation.data])

  const queryErrorText = useMemo(() => {
    if (queryLocalError) return queryLocalError
    if (!queryMutation.error) return undefined
    if (queryMutation.error instanceof Error) return queryMutation.error.message
    return "Query failed"
  }, [queryLocalError, queryMutation.error])

  const canOpenQuery = Boolean(contract && !contractLoading)
  const canAdmin =
    Boolean(contract?.admin) &&
    Boolean(account?.address) &&
    contract?.admin === account?.address

  const handleOpenQuery = () => {
    if (!canOpenQuery) return
    setQueryLocalError(undefined)
    queryMutation.reset()
    setQueryOpen(true)
  }

  const openUpload = () => {
    setUploadError(undefined)
    setUploadHash("")
    setUploadCodeId("")
    setTxModal("upload")
  }

  const openInstantiate = () => {
    setInstantiateError(undefined)
    setInstantiateHash("")
    setInstantiateAddress("")
    setInstantiateCodeId("")
    setInstantiateLabel("")
    setInstantiateMsg(DEFAULT_INSTANTIATE_MSG)
    setInstantiateFunds("")
    setInstantiateFundsDenom(CLASSIC_DENOMS.lunc.coinMinimalDenom)
    setInstantiateAdmin(account?.address ?? "")
    setTxModal("instantiate")
  }

  const connectClient = async () => {
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
    return SigningStargateClient.connectWithSigner(CLASSIC_CHAIN.rpc, signer, {
      gasPrice: GasPrice.fromString(
        `${GAS_PRICE_MICRO}${CLASSIC_DENOMS.lunc.coinMinimalDenom}`
      )
    })
  }

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account?.address) {
      setUploadError("Please connect a wallet first.")
      return
    }
    if (!uploadFile) {
      setUploadError("Select a .wasm file first.")
      return
    }

    try {
      setUploadSubmitting(true)
      setUploadError(undefined)
      setUploadHash("")
      setUploadCodeId("")
      startTx("Upload contract")
      const wasmByteCode = new Uint8Array(await uploadFile.arrayBuffer())
      if (!wasmByteCode.length) {
        throw new Error("WASM file is empty.")
      }
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgStoreCode",
        value: MsgStoreCode.fromPartial({
          sender: account.address,
          wasmByteCode
        })
      }
      const result = await client.signAndBroadcast(account.address, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Upload failed")
      }
      const codeId = extractEventAttr(result.events, ["code_id", "codeId"]) ?? ""
      setUploadHash(result.transactionHash)
      setUploadCodeId(codeId)
      finishTx(result.transactionHash)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed"
      setUploadError(message)
      failTx(message)
    } finally {
      setUploadSubmitting(false)
    }
  }

  const handleInstantiateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account?.address) {
      setInstantiateError("Please connect a wallet first.")
      return
    }
    if (!instantiateCodeId.trim()) {
      setInstantiateError("Code ID is required.")
      return
    }
    if (!instantiateLabel.trim()) {
      setInstantiateError("Label is required.")
      return
    }

    let codeId: bigint
    try {
      codeId = BigInt(instantiateCodeId.trim())
      if (codeId <= 0n) throw new Error("invalid")
    } catch {
      setInstantiateError("Code ID must be a positive integer.")
      return
    }

    let parsedMsg: Record<string, unknown>
    try {
      parsedMsg = JSON.parse(instantiateMsg) as Record<string, unknown>
    } catch {
      setInstantiateError("Init message must be valid JSON.")
      return
    }

    const fundAmount = toMicroAmount(instantiateFunds)

    try {
      setInstantiateSubmitting(true)
      setInstantiateError(undefined)
      setInstantiateHash("")
      setInstantiateAddress("")
      startTx("Instantiate contract")
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgInstantiateContract",
        value: MsgInstantiateContract.fromPartial({
          sender: account.address,
          admin: instantiateAdmin.trim(),
          codeId,
          label: instantiateLabel.trim(),
          msg: toUtf8(JSON.stringify(parsedMsg)),
          funds:
            fundAmount === "0"
              ? []
              : [
                  {
                    denom: instantiateFundsDenom,
                    amount: fundAmount
                  }
                ]
        })
      }
      const result = await client.signAndBroadcast(account.address, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Instantiate failed")
      }
      const contractAddress =
        extractEventAttr(result.events, ["_contract_address", "contract_address"]) ??
        ""
      setInstantiateHash(result.transactionHash)
      setInstantiateAddress(contractAddress)
      if (contractAddress) setAddress(contractAddress)
      finishTx(result.transactionHash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Instantiate failed"
      setInstantiateError(message)
      failTx(message)
    } finally {
      setInstantiateSubmitting(false)
    }
  }

  const handleSubmitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(queryInput) as Record<string, unknown>
    } catch {
      setQueryLocalError("Invalid JSON")
      return
    }
    setQueryLocalError(undefined)
    queryMutation.mutate(parsed)
  }

  return (
    <PageShell
      title="Contract"
      extra={
        <>
          <button
            className="uiButton uiButtonPrimary"
            type="button"
            disabled={!account?.address}
            title={!account?.address ? "Connect wallet first" : undefined}
            onClick={openUpload}
          >
            Upload
          </button>
          <button
            className="uiButton uiButtonPrimary"
            type="button"
            disabled={!account?.address}
            title={!account?.address ? "Connect wallet first" : undefined}
            onClick={openInstantiate}
          >
            Instantiate
          </button>
        </>
      }
    >
      <div className={styles.contract}>
        <div className={styles.contractSearch}>
          <div className={styles.searchField}>
            <SearchIcon className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search by contract address"
              aria-label="Search by contract address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.contractBody}>
          {!hasAddress || !isValidAddress ? (
            <div className={`card ${styles.stateCard}`}>
              <div className={styles.stateIcon}>
                <SearchIcon />
              </div>
              <div className={styles.stateText}>Search by contract address</div>
            </div>
          ) : contractLoading ? (
            <div className={`card ${styles.stateCard}`}>
              <div className={styles.stateIcon}>
                <SearchIcon />
              </div>
              <div className={styles.stateText}>Loading contract...</div>
            </div>
          ) : contractError || !contract ? (
            <div className={`card ${styles.stateCard}`}>
              <div className={styles.stateIcon}>
                <SearchIcon />
              </div>
              <div className={styles.stateText}>Contract not found</div>
            </div>
          ) : (
            <div className={`card ${styles.resultCard}`}>
              <div className={styles.resultHeader}>
                <FinderAddressLink address={contract.address} />
                <div className={styles.resultActions}>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    onClick={handleOpenQuery}
                  >
                    Query
                  </button>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    disabled
                    title="Coming soon"
                  >
                    Execute
                  </button>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    disabled={!canAdmin}
                    title={!canAdmin ? "Admin only" : undefined}
                  >
                    Migrate
                  </button>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    disabled={!canAdmin}
                    title={!canAdmin ? "Admin only" : undefined}
                  >
                    Update Admin
                  </button>
                </div>
              </div>
              <div className={styles.resultBody}>
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaTitle}>Code ID</span>
                    <strong className={styles.metaValue}>
                      {contract.code_id || "--"}
                    </strong>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaTitle}>Creator</span>
                    {contract.creator ? (
                      <FinderAddressLink address={contract.creator} />
                    ) : (
                      <strong className={styles.metaValue}>--</strong>
                    )}
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaTitle}>Admin</span>
                    {contract.admin ? (
                      <FinderAddressLink address={contract.admin} />
                    ) : (
                      <strong className={styles.metaValue}>--</strong>
                    )}
                  </div>
                </div>
                <div className={styles.initMsgWrap}>
                  <div className={styles.initMsgTitle}>InitMsg</div>
                  <pre className={styles.initMsgPre}>{initMsgText}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {queryOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.queryBackdrop}
              role="dialog"
              aria-modal="true"
              onClick={() => setQueryOpen(false)}
            >
              <div
                className={styles.queryModal}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.queryHeader}>
                  <div className={styles.queryTitle}>Query</div>
                  <button
                    className={styles.queryClose}
                    type="button"
                    onClick={() => setQueryOpen(false)}
                    aria-label="Close query modal"
                  >
                    {CLOSE_ICON}
                  </button>
                </div>
                <form className={styles.queryForm} onSubmit={handleSubmitQuery}>
                  <label className={styles.queryLabel} htmlFor="contract-query-input">
                    Input
                  </label>

                  <textarea
                    id="contract-query-input"
                    className={styles.queryInput}
                    value={queryInput}
                    onChange={(event) => setQueryInput(event.target.value)}
                    placeholder='{"token_info": {}}'
                    spellCheck={false}
                  />
                  {queryErrorText ? (
                    <div className={styles.queryError}>{queryErrorText}</div>
                  ) : null}

                  {queryOutputText ? (
                    <div className={styles.queryOutputWrap}>
                      <div className={styles.queryLabel}>Output</div>
                      <pre className={styles.queryOutput}>{queryOutputText}</pre>
                    </div>
                  ) : null}

                  <div className={styles.queryActions}>
                    <button
                      className="uiButton uiButtonOutline"
                      type="button"
                      onClick={() => setQueryOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="uiButton uiButtonPrimary"
                      type="submit"
                      disabled={queryMutation.isPending}
                    >
                      {queryMutation.isPending ? "Querying..." : "Query"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {txModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.queryBackdrop}
              role="dialog"
              aria-modal="true"
              onClick={() => setTxModal(null)}
            >
              <div
                className={styles.txModal}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.queryHeader}>
                  <div className={styles.queryTitle}>
                    {txModal === "upload"
                      ? "Upload contract"
                      : "Instantiate contract"}
                  </div>
                  <button
                    className={styles.queryClose}
                    type="button"
                    onClick={() => setTxModal(null)}
                    aria-label="Close contract action modal"
                  >
                    {CLOSE_ICON}
                  </button>
                </div>

                {txModal === "upload" ? (
                  <form className={styles.txForm} onSubmit={handleUploadSubmit}>
                    <label className={styles.txLabel} htmlFor="contract-upload-file">
                      WASM file
                    </label>
                    <input
                      id="contract-upload-file"
                      className={styles.txInput}
                      type="file"
                      accept=".wasm,.wasm.gz,application/wasm"
                      onChange={(event) => {
                        const next = event.target.files?.[0] ?? null
                        setUploadFile(next)
                      }}
                    />
                    <div className={styles.txHint}>
                      Upload compiled CosmWasm bytecode from your local machine.
                    </div>
                    {uploadError ? (
                      <div className={styles.queryError}>{uploadError}</div>
                    ) : null}
                    {uploadHash ? (
                      <div className={styles.txResult}>
                        <div>
                          Tx:{" "}
                          <a
                            href={`https://finder.burrito.money/classic/tx/${uploadHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(uploadHash)}
                          </a>
                        </div>
                        {uploadCodeId ? <div>Code ID: {uploadCodeId}</div> : null}
                      </div>
                    ) : null}
                    <div className={styles.queryActions}>
                      <button
                        className="uiButton uiButtonOutline"
                        type="button"
                        onClick={() => setTxModal(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="uiButton uiButtonPrimary"
                        type="submit"
                        disabled={uploadSubmitting}
                      >
                        {uploadSubmitting ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form
                    className={styles.txForm}
                    onSubmit={handleInstantiateSubmit}
                  >
                    <label className={styles.txLabel} htmlFor="contract-code-id">
                      Code ID
                    </label>
                    <input
                      id="contract-code-id"
                      className={styles.txInput}
                      value={instantiateCodeId}
                      onChange={(event) => setInstantiateCodeId(event.target.value)}
                      placeholder="e.g. 1234"
                    />

                    <label className={styles.txLabel} htmlFor="contract-label">
                      Label
                    </label>
                    <input
                      id="contract-label"
                      className={styles.txInput}
                      value={instantiateLabel}
                      onChange={(event) => setInstantiateLabel(event.target.value)}
                      placeholder="My contract"
                    />

                    <label className={styles.txLabel} htmlFor="contract-admin">
                      Admin (optional)
                    </label>
                    <input
                      id="contract-admin"
                      className={styles.txInput}
                      value={instantiateAdmin}
                      onChange={(event) => setInstantiateAdmin(event.target.value)}
                      placeholder="terra1..."
                    />

                    <label className={styles.txLabel} htmlFor="contract-init-msg">
                      Init message (JSON)
                    </label>
                    <textarea
                      id="contract-init-msg"
                      className={styles.txTextarea}
                      value={instantiateMsg}
                      onChange={(event) => setInstantiateMsg(event.target.value)}
                      spellCheck={false}
                    />

                    <div className={styles.txFundsRow}>
                      <div className={styles.txFundsItem}>
                        <label
                          className={styles.txLabel}
                          htmlFor="contract-funds-amount"
                        >
                          Funds (optional)
                        </label>
                        <input
                          id="contract-funds-amount"
                          className={styles.txInput}
                          value={instantiateFunds}
                          onChange={(event) =>
                            setInstantiateFunds(event.target.value)
                          }
                          placeholder="0.0"
                        />
                      </div>
                      <div className={styles.txFundsItem}>
                        <label
                          className={styles.txLabel}
                          htmlFor="contract-funds-denom"
                        >
                          Denom
                        </label>
                        <select
                          id="contract-funds-denom"
                          className={styles.txInput}
                          value={instantiateFundsDenom}
                          onChange={(event) =>
                            setInstantiateFundsDenom(event.target.value)
                          }
                        >
                          <option value={CLASSIC_DENOMS.lunc.coinMinimalDenom}>
                            LUNC
                          </option>
                          <option value={CLASSIC_DENOMS.ustc.coinMinimalDenom}>
                            USTC
                          </option>
                        </select>
                      </div>
                    </div>

                    {instantiateError ? (
                      <div className={styles.queryError}>{instantiateError}</div>
                    ) : null}
                    {instantiateHash ? (
                      <div className={styles.txResult}>
                        <div>
                          Tx:{" "}
                          <a
                            href={`https://finder.burrito.money/classic/tx/${instantiateHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(instantiateHash)}
                          </a>
                        </div>
                        {instantiateAddress ? (
                          <div>
                            Contract:{" "}
                            <a
                              href={`https://finder.burrito.money/classic/address/${instantiateAddress}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {truncateHash(instantiateAddress)}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={styles.queryActions}>
                      <button
                        className="uiButton uiButtonOutline"
                        type="button"
                        onClick={() => setTxModal(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="uiButton uiButtonPrimary"
                        type="submit"
                        disabled={instantiateSubmitting}
                      >
                        {instantiateSubmitting ? "Broadcasting..." : "Instantiate"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </PageShell>
  )
}

export default Contract
