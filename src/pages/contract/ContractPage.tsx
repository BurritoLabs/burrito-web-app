import { useMemo, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toUtf8 } from "@cosmjs/encoding"
import {
  MsgClearAdmin,
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgMigrateContract,
  MsgStoreCode,
  MsgUpdateAdmin
} from "cosmjs-types/cosmwasm/wasm/v1/tx"
import PageShell from "../PageShell"
import styles from "../Contract.module.css"
import {
  fetchContractInfo,
  fetchContractInitMsg,
  queryContractSmart
} from "../../app/data/classic"
import { CLASSIC_DENOMS } from "../../app/chain"
import { truncateHash } from "../../app/utils/format"
import { formatTxError } from "../../app/utils/txError"
import { useWallet } from "../../app/wallet/WalletContext"
import {
  connectClassicSigningClientForConnector,
  getSignerAddressForConnector
} from "../../app/wallet/walletAdapters"
import {
  DEFAULT_EXECUTE_MSG,
  DEFAULT_INSTANTIATE_MSG,
  DEFAULT_MIGRATE_MSG,
  DEFAULT_QUERY,
  extractEventAttr,
  parseJsonRecord,
  toMicroAmount
} from "../../app/contract/contractHelpers"
import { FinderAddressLink, SearchIcon } from "./ContractLinks"

const CLOSE_ICON = (
  <>
    <span />
    <span />
  </>
)

const Contract = () => {
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const queryClient = useQueryClient()
  const [address, setAddress] = useState("")
  const [queryOpen, setQueryOpen] = useState(false)
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY)
  const [queryLocalError, setQueryLocalError] = useState<string>()
  const [txModal, setTxModal] = useState<
    "upload" | "instantiate" | "execute" | "migrate" | "admin" | null
  >(null)
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
  const [executeMsg, setExecuteMsg] = useState(DEFAULT_EXECUTE_MSG)
  const [executeFunds, setExecuteFunds] = useState("")
  const [executeFundsDenom, setExecuteFundsDenom] = useState<string>(
    CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const [executeSubmitting, setExecuteSubmitting] = useState(false)
  const [executeError, setExecuteError] = useState<string>()
  const [executeHash, setExecuteHash] = useState("")
  const [migrateCodeId, setMigrateCodeId] = useState("")
  const [migrateMsg, setMigrateMsg] = useState(DEFAULT_MIGRATE_MSG)
  const [migrateSubmitting, setMigrateSubmitting] = useState(false)
  const [migrateError, setMigrateError] = useState<string>()
  const [migrateHash, setMigrateHash] = useState("")
  const [nextAdmin, setNextAdmin] = useState("")
  const [clearAdmin, setClearAdmin] = useState(false)
  const [adminSubmitting, setAdminSubmitting] = useState(false)
  const [adminError, setAdminError] = useState<string>()
  const [adminHash, setAdminHash] = useState("")
  const [adminResultText, setAdminResultText] = useState("")
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

  const openExecute = () => {
    setExecuteError(undefined)
    setExecuteHash("")
    setExecuteMsg(DEFAULT_EXECUTE_MSG)
    setExecuteFunds("")
    setExecuteFundsDenom(CLASSIC_DENOMS.lunc.coinMinimalDenom)
    setTxModal("execute")
  }

  const openMigrate = () => {
    setMigrateError(undefined)
    setMigrateHash("")
    setMigrateCodeId(contract?.code_id ?? "")
    setMigrateMsg(DEFAULT_MIGRATE_MSG)
    setTxModal("migrate")
  }

  const openAdmin = () => {
    setAdminError(undefined)
    setAdminHash("")
    setAdminResultText("")
    setNextAdmin(contract?.admin ?? "")
    setClearAdmin(false)
    setTxModal("admin")
  }

  const invalidateContract = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["contract", trimmedAddress]
    })
    await queryClient.invalidateQueries({
      queryKey: ["contract-init-msg", trimmedAddress]
    })
  }

  const connectClient = async () => {
    if (!connectorId) throw new Error("Wallet not connected")
    return connectClassicSigningClientForConnector(connectorId)
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
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const wasmByteCode = new Uint8Array(await uploadFile.arrayBuffer())
      if (!wasmByteCode.length) {
        throw new Error("WASM file is empty.")
      }
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgStoreCode",
        value: MsgStoreCode.fromPartial({
          sender: signerAddress,
          wasmByteCode
        })
      }
      const result = await client.signAndBroadcast(signerAddress, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Upload failed")
      }
      const codeId = extractEventAttr(result.events, ["code_id", "codeId"]) ?? ""
      setUploadHash(result.transactionHash)
      setUploadCodeId(codeId)
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Upload failed")
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
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgInstantiateContract",
        value: MsgInstantiateContract.fromPartial({
          sender: signerAddress,
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
      const result = await client.signAndBroadcast(signerAddress, [msg], "auto")
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
      const message = formatTxError(error, "Instantiate failed")
      setInstantiateError(message)
      failTx(message)
    } finally {
      setInstantiateSubmitting(false)
    }
  }

  const handleExecuteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account?.address) {
      setExecuteError("Please connect a wallet first.")
      return
    }
    if (!contract?.address) {
      setExecuteError("Load a contract first.")
      return
    }

    let parsedMsg: Record<string, unknown>
    try {
      parsedMsg = parseJsonRecord(executeMsg, "Execute message")
    } catch (error) {
      setExecuteError(
        error instanceof Error ? error.message : "Execute message is invalid."
      )
      return
    }

    const fundAmount = toMicroAmount(executeFunds)

    try {
      setExecuteSubmitting(true)
      setExecuteError(undefined)
      setExecuteHash("")
      startTx("Execute contract")
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: MsgExecuteContract.fromPartial({
          sender: signerAddress,
          contract: contract.address,
          msg: toUtf8(JSON.stringify(parsedMsg)),
          funds:
            fundAmount === "0"
              ? []
              : [
                  {
                    denom: executeFundsDenom,
                    amount: fundAmount
                  }
                ]
        })
      }
      const result = await client.signAndBroadcast(signerAddress, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Execute failed")
      }
      setExecuteHash(result.transactionHash)
      finishTx(result.transactionHash)
      await invalidateContract()
    } catch (error) {
      const message = formatTxError(error, "Execute failed")
      setExecuteError(message)
      failTx(message)
    } finally {
      setExecuteSubmitting(false)
    }
  }

  const handleMigrateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account?.address) {
      setMigrateError("Please connect a wallet first.")
      return
    }
    if (!contract?.address) {
      setMigrateError("Load a contract first.")
      return
    }
    if (!canAdmin) {
      setMigrateError("Only the current admin can migrate this contract.")
      return
    }
    if (!migrateCodeId.trim()) {
      setMigrateError("Code ID is required.")
      return
    }

    let codeId: bigint
    try {
      codeId = BigInt(migrateCodeId.trim())
      if (codeId <= 0n) throw new Error("invalid")
    } catch {
      setMigrateError("Code ID must be a positive integer.")
      return
    }

    let parsedMsg: Record<string, unknown>
    try {
      parsedMsg = parseJsonRecord(migrateMsg, "Migrate message")
    } catch (error) {
      setMigrateError(
        error instanceof Error ? error.message : "Migrate message is invalid."
      )
      return
    }

    try {
      setMigrateSubmitting(true)
      setMigrateError(undefined)
      setMigrateHash("")
      startTx("Migrate contract")
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClient()
      const msg = {
        typeUrl: "/cosmwasm.wasm.v1.MsgMigrateContract",
        value: MsgMigrateContract.fromPartial({
          sender: signerAddress,
          contract: contract.address,
          codeId,
          msg: toUtf8(JSON.stringify(parsedMsg))
        })
      }
      const result = await client.signAndBroadcast(signerAddress, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Migrate failed")
      }
      setMigrateHash(result.transactionHash)
      finishTx(result.transactionHash)
      await invalidateContract()
    } catch (error) {
      const message = formatTxError(error, "Migrate failed")
      setMigrateError(message)
      failTx(message)
    } finally {
      setMigrateSubmitting(false)
    }
  }

  const handleAdminSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!account?.address) {
      setAdminError("Please connect a wallet first.")
      return
    }
    if (!contract?.address) {
      setAdminError("Load a contract first.")
      return
    }
    if (!canAdmin) {
      setAdminError("Only the current admin can update this contract admin.")
      return
    }

    const next = nextAdmin.trim()
    if (!clearAdmin && !/^terra1[0-9a-z]{38}$/.test(next)) {
      setAdminError("Enter a valid Terra Classic address.")
      return
    }

    try {
      setAdminSubmitting(true)
      setAdminError(undefined)
      setAdminHash("")
      setAdminResultText("")
      startTx(clearAdmin ? "Clear contract admin" : "Update contract admin")
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClient()
      const msg = clearAdmin
        ? {
            typeUrl: "/cosmwasm.wasm.v1.MsgClearAdmin",
            value: MsgClearAdmin.fromPartial({
              sender: signerAddress,
              contract: contract.address
            })
          }
        : {
            typeUrl: "/cosmwasm.wasm.v1.MsgUpdateAdmin",
            value: MsgUpdateAdmin.fromPartial({
              sender: signerAddress,
              contract: contract.address,
              newAdmin: next
            })
          }

      const result = await client.signAndBroadcast(signerAddress, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Update admin failed")
      }
      setAdminHash(result.transactionHash)
      setAdminResultText(
        clearAdmin ? "Admin removed from contract." : `New admin: ${next}`
      )
      finishTx(result.transactionHash)
      await invalidateContract()
    } catch (error) {
      const message = formatTxError(error, "Update admin failed")
      setAdminError(message)
      failTx(message)
    } finally {
      setAdminSubmitting(false)
    }
  }

  const handleSubmitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonRecord(queryInput, "Query input")
    } catch (error) {
      setQueryLocalError(
        error instanceof Error ? error.message : "Query input is invalid."
      )
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
                    onClick={openExecute}
                    disabled={!account?.address}
                    title={!account?.address ? "Connect wallet first" : undefined}
                  >
                    Execute
                  </button>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    disabled={!canAdmin}
                    title={!canAdmin ? "Admin only" : undefined}
                    onClick={openMigrate}
                  >
                    Migrate
                  </button>
                  <button
                    className="uiButton uiButtonOutline"
                    type="button"
                    disabled={!canAdmin}
                    title={!canAdmin ? "Admin only" : undefined}
                    onClick={openAdmin}
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
                      : txModal === "instantiate"
                      ? "Instantiate contract"
                      : txModal === "execute"
                      ? "Execute contract"
                      : txModal === "migrate"
                      ? "Migrate contract"
                      : "Update admin"}
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
                ) : txModal === "instantiate" ? (
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
                ) : txModal === "execute" ? (
                  <form className={styles.txForm} onSubmit={handleExecuteSubmit}>
                    <div className={styles.txHint}>
                      Send an execute message to{" "}
                      <strong>{truncateHash(contract?.address ?? trimmedAddress)}</strong>.
                    </div>

                    <label className={styles.txLabel} htmlFor="contract-execute-msg">
                      Execute message (JSON)
                    </label>
                    <textarea
                      id="contract-execute-msg"
                      className={styles.txTextarea}
                      value={executeMsg}
                      onChange={(event) => setExecuteMsg(event.target.value)}
                      spellCheck={false}
                    />

                    <div className={styles.txFundsRow}>
                      <div className={styles.txFundsItem}>
                        <label
                          className={styles.txLabel}
                          htmlFor="contract-execute-funds-amount"
                        >
                          Funds (optional)
                        </label>
                        <input
                          id="contract-execute-funds-amount"
                          className={styles.txInput}
                          value={executeFunds}
                          onChange={(event) => setExecuteFunds(event.target.value)}
                          placeholder="0.0"
                        />
                      </div>
                      <div className={styles.txFundsItem}>
                        <label
                          className={styles.txLabel}
                          htmlFor="contract-execute-funds-denom"
                        >
                          Denom
                        </label>
                        <select
                          id="contract-execute-funds-denom"
                          className={styles.txInput}
                          value={executeFundsDenom}
                          onChange={(event) =>
                            setExecuteFundsDenom(event.target.value)
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

                    {executeError ? (
                      <div className={styles.queryError}>{executeError}</div>
                    ) : null}
                    {executeHash ? (
                      <div className={styles.txResult}>
                        <div>
                          Tx:{" "}
                          <a
                            href={`https://finder.burrito.money/classic/tx/${executeHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(executeHash)}
                          </a>
                        </div>
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
                        disabled={executeSubmitting}
                      >
                        {executeSubmitting ? "Broadcasting..." : "Execute"}
                      </button>
                    </div>
                  </form>
                ) : txModal === "migrate" ? (
                  <form className={styles.txForm} onSubmit={handleMigrateSubmit}>
                    <div className={styles.txHint}>
                      Migrate this contract to a new code ID. Only the current admin
                      can perform this action.
                    </div>

                    <label className={styles.txLabel} htmlFor="contract-migrate-code-id">
                      New code ID
                    </label>
                    <input
                      id="contract-migrate-code-id"
                      className={styles.txInput}
                      value={migrateCodeId}
                      onChange={(event) => setMigrateCodeId(event.target.value)}
                      placeholder="e.g. 1234"
                    />

                    <label className={styles.txLabel} htmlFor="contract-migrate-msg">
                      Migrate message (JSON)
                    </label>
                    <textarea
                      id="contract-migrate-msg"
                      className={styles.txTextarea}
                      value={migrateMsg}
                      onChange={(event) => setMigrateMsg(event.target.value)}
                      spellCheck={false}
                    />

                    {migrateError ? (
                      <div className={styles.queryError}>{migrateError}</div>
                    ) : null}
                    {migrateHash ? (
                      <div className={styles.txResult}>
                        <div>
                          Tx:{" "}
                          <a
                            href={`https://finder.burrito.money/classic/tx/${migrateHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(migrateHash)}
                          </a>
                        </div>
                        <div>Contract migrated successfully.</div>
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
                        disabled={migrateSubmitting}
                      >
                        {migrateSubmitting ? "Broadcasting..." : "Migrate"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className={styles.txForm} onSubmit={handleAdminSubmit}>
                    <div className={styles.txHint}>
                      Update or clear the admin for{" "}
                      <strong>{truncateHash(contract?.address ?? trimmedAddress)}</strong>.
                    </div>

                    <label className={styles.txLabel} htmlFor="contract-current-admin">
                      Current admin
                    </label>
                    <input
                      id="contract-current-admin"
                      className={styles.txInput}
                      value={contract?.admin ?? ""}
                      readOnly
                    />

                    <label className={styles.txLabel} htmlFor="contract-next-admin">
                      New admin
                    </label>
                    <input
                      id="contract-next-admin"
                      className={styles.txInput}
                      value={nextAdmin}
                      onChange={(event) => setNextAdmin(event.target.value)}
                      placeholder="terra1..."
                      disabled={clearAdmin}
                    />

                    <label className={styles.txToggle}>
                      <input
                        type="checkbox"
                        checked={clearAdmin}
                        onChange={(event) => setClearAdmin(event.target.checked)}
                      />
                      <span>Remove admin instead of setting a new one</span>
                    </label>

                    {adminError ? (
                      <div className={styles.queryError}>{adminError}</div>
                    ) : null}
                    {adminHash ? (
                      <div className={styles.txResult}>
                        <div>
                          Tx:{" "}
                          <a
                            href={`https://finder.burrito.money/classic/tx/${adminHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {truncateHash(adminHash)}
                          </a>
                        </div>
                        {adminResultText ? <div>{adminResultText}</div> : null}
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
                        disabled={adminSubmitting}
                      >
                        {adminSubmitting
                          ? "Broadcasting..."
                          : clearAdmin
                          ? "Clear admin"
                          : "Update admin"}
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
