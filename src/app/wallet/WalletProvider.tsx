import type { ChainWalletBase } from "@cosmos-kit/core"
import type { OfflineSigner } from "@cosmjs/proto-signing"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useAppChain } from "../appChainContext"
import { getActiveAppChainKey } from "../activeChain"
import { useTransactionReceipt } from "../tx/useTransactionReceipt"
import { reportRuntimeError } from "../feedback/runtimeErrorReporter"
import {
  COSMOS_CONNECTOR_CONFIGS,
  COSMOS_WALLET_NAME_TO_CONNECTOR_ID,
  isCosmosConnectorId
} from "./cosmosKitMeta"
import { getGalaxyConnector } from "./galaxyWallet"
import { getBurritoNativeConnector, invalidateBurritoNativeSession } from "./burritoNativeWallet"
import {
  BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT,
  getBurritoExtensionConnector,
  getBurritoExtensionConnectionErrorMessage,
  invalidateBurritoExtensionSession
} from "./burritoExtensionWallet"
import {
  WalletContext,
  type WalletAccount,
  type WalletConnector,
  type WalletConnectorId,
  type WalletContextValue,
  type WalletStatus
} from "./WalletContext"
import type { WalletRuntimeChain, WalletRuntimeSnapshot } from "./walletRuntimeBridge"
import { isTouchWalletCapableBrowser } from "./walletPlatform"
import { hasDesktopKeplrProvider } from "./keplrProviderIdentity"
import { getKeplrConnectionErrorMessage } from "./keplrConnectionErrors"
import { publishSigningSelection } from "./signingSelection"
import { canRetryWalletRecovery } from "./walletRecoveryRetry"
import {
  forgetStoredWalletSession,
  getStoredWalletConnectorId,
  isWalletManualDisconnectStored,
  rememberWalletManualDisconnect,
  rememberWalletConnectorId
} from "./walletMeta"
import {
  isWalletInitializationError,
  runWithWalletInitializationRetry
} from "./walletInitialization"
import { connectKeplrMobile, liveKeplrMobileAddress, restoreKeplrMobileAddress } from "./keplrMobileSession"
const MOBILE_ACCOUNT_HYDRATION_DELAYS_MS = [250, 1000, 2500, 5000] as const
const AUTO_RECONNECT_RETRY_COOLDOWN_MS = 15_000

type PendingWalletRuntimeRequest = {
  chainKey: WalletRuntimeSnapshot["chainKey"]
  resolve: (runtime: WalletRuntimeChain | undefined) => void
}

const formatWalletError = (error: unknown) =>
  error instanceof Error ? error.message : "Wallet connection failed"

const isWalletReady = (wallet?: ChainWalletBase) =>
  Boolean(wallet && !wallet.isWalletNotExist)

const matchesWalletAlias = (wallet: ChainWalletBase, aliases: string[]) => {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase())
  const walletName = wallet.walletName?.toLowerCase?.() ?? ""
  const walletPrettyName = wallet.walletPrettyName?.toLowerCase?.() ?? ""

  return normalizedAliases.some(
    (alias) => walletName === alias || walletPrettyName === alias
  )
}

const buildWalletAccount = (wallet: ChainWalletBase): WalletAccount | undefined => {
  const address = wallet.address
  if (!address) {
    return undefined
  }

  return {
    address,
    name: wallet.username || wallet.walletPrettyName
  }
}

const waitForWalletAddress = async (wallet: ChainWalletBase, attempts = 10, delayMs = 200) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (wallet.address) {
      return wallet.address
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }
  return wallet.address
}

const getOfflineSignerAddress = async (signer: OfflineSigner) => {
  const account = (await signer.getAccounts())[0]
  if (!account?.address) {
    throw new Error("Wallet account unavailable")
  }
  return account.address
}

export const WalletProvider = ({
  children,
  runtime,
  runtimeError,
  onRuntimeRequested
}: {
  children: ReactNode
  runtime?: WalletRuntimeSnapshot
  runtimeError?: Error
  onRuntimeRequested: () => void
}) => {
  const { chainKey, chain } = useAppChain()
  const cosmosChain = runtime?.chainKey === chainKey ? runtime.chain : undefined
  const walletRepo = cosmosChain?.walletRepo
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const { txState, startTx, finishTx, failTx, clearTx, setTxPhase, showTxReceipt, checkTxReceipt, acknowledgeTxReview } =
    useTransactionReceipt(chainKey, account?.address, connectorId)
  const [walletPreparingForTx, setWalletPreparingForTx] = useState(false)
  const accountAddressRef = useRef<string | undefined>(undefined)
  const connectorIdRef = useRef<WalletConnectorId | undefined>(undefined)
  const walletStatusRef = useRef<WalletStatus>("disconnected")
  const lastAutoConnectRetryAtRef = useRef(0)
  const previousChainKeyRef = useRef(chainKey)
  const manualDisconnectRef = useRef(isWalletManualDisconnectStored())
  const connectionAttemptRef = useRef(0)
  const pendingConnectorRef = useRef<WalletConnectorId | undefined>(undefined)
  const selectedConnectorRef = useRef<WalletConnectorId | undefined>(undefined)
  const pendingRuntimeRequestRef = useRef<PendingWalletRuntimeRequest | undefined>(undefined)
  const [connectorRefreshNonce, setConnectorRefreshNonce] = useState(0)
  const [storedAutoConnectId, setStoredAutoConnectId] = useState<
    WalletConnectorId | undefined
  >(
    () => getStoredWalletConnectorId()
  )
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(
    () => !storedAutoConnectId
  )
  const autoConnectAttemptedRef = useRef(autoConnectAttempted)

  const cancelRuntimeRequest = useCallback(() => {
    const request = pendingRuntimeRequestRef.current
    pendingRuntimeRequestRef.current = undefined
    request?.resolve(undefined)
  }, [])

  useEffect(() => () => {
    connectionAttemptRef.current += 1
    if (selectedConnectorRef.current === "burrito-extension") {
      invalidateBurritoExtensionSession()
    }
    pendingConnectorRef.current = undefined
    cancelRuntimeRequest()
  }, [cancelRuntimeRequest])

  useEffect(() => {
    const request = pendingRuntimeRequestRef.current
    if (!request || request.chainKey !== chainKey || !cosmosChain) return
    pendingRuntimeRequestRef.current = undefined
    request.resolve(cosmosChain)
  }, [chainKey, cosmosChain])

  useEffect(() => {
    if (!runtimeError) return
    const selected = pendingConnectorRef.current ?? selectedConnectorRef.current ??
      connectorIdRef.current ?? getStoredWalletConnectorId()
    // A failed mobile SDK must not clear a desktop session or orphan its approval.
    if (selected !== "keplr-mobile") return
    connectionAttemptRef.current += 1
    pendingConnectorRef.current = undefined
    selectedConnectorRef.current = undefined
    cancelRuntimeRequest()
    if (getStoredWalletConnectorId() === "keplr-mobile") forgetStoredWalletSession()
    setStoredAutoConnectId(undefined)
    setAutoConnectAttempted(true)
    setConnectorId(undefined)
    setAccount(undefined)
    setStatus("disconnected")
    setError("Mobile wallet could not load. Reload the page to try again.")
  }, [cancelRuntimeRequest, runtimeError])

  const waitForWalletRuntime = useCallback(() => {
    if (runtimeError) {
      return Promise.reject(new Error("Mobile wallet could not load. Reload the page to try again."))
    }
    if (cosmosChain) return Promise.resolve(cosmosChain)
    return new Promise<WalletRuntimeChain | undefined>((resolve) => {
      pendingRuntimeRequestRef.current = { chainKey, resolve }
      onRuntimeRequested()
    })
  }, [chainKey, cosmosChain, onRuntimeRequested, runtimeError])

  const supportsMobileWallets = useMemo(() => isTouchWalletCapableBrowser(), [])
  const currentCosmosWallet = cosmosChain?.currentWallet
  const currentCosmosWalletName = currentCosmosWallet?.walletName
  const desktopKeplrAvailable = hasDesktopKeplrProvider()
  const effectiveAutoConnectId =
    storedAutoConnectId === "keplr-mobile" && desktopKeplrAvailable
      ? "keplr"
      : storedAutoConnectId
  const activeCosmosConnectorId = currentCosmosWalletName
    ? COSMOS_WALLET_NAME_TO_CONNECTOR_ID[currentCosmosWalletName]
    : undefined

  const refreshConnectors = useCallback(() => {
    setConnectorRefreshNonce((current) => current + 1)
  }, [])

  useEffect(() => {
    accountAddressRef.current = account?.address
    connectorIdRef.current = connectorId
    walletStatusRef.current = status
    autoConnectAttemptedRef.current = autoConnectAttempted
  }, [account?.address, autoConnectAttempted, connectorId, status])

  const getCosmosWallet = useCallback(
    (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      options?: { preferConnected?: boolean; runtime?: WalletRuntimeChain }
    ) => {
      if (id === "keplr" && !hasDesktopKeplrProvider()) return undefined
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      const repo = options?.runtime?.walletRepo ?? walletRepo
      const wallet =
        repo?.getWallet(config.walletName) ??
        repo?.wallets.find((item) =>
          matchesWalletAlias(item, [config.walletName, config.label])
        )

      if (
        options?.preferConnected &&
        wallet &&
        !wallet.isWalletDisconnected &&
        !wallet.isWalletNotExist
      ) {
        return wallet
      }

      return wallet
    },
    [walletRepo]
  )

  const signingOwner = useRef({})
  useLayoutEffect(() => publishSigningSelection({
    token: signingOwner.current,
    matches: (id, address, chainId) => {
      if (manualDisconnectRef.current || chain.chainId !== chainId || status !== "connected" ||
          connectorId !== id || account?.address !== address ||
          (pendingConnectorRef.current && pendingConnectorRef.current !== id) ||
          (selectedConnectorRef.current && selectedConnectorRef.current !== id)) return false
      if (id !== "keplr-mobile") return true
      // Keplr's WC signer may return its last cached key. Also require the
      // approved account in the currently usable session and pairing.
      const wallet = getCosmosWallet(id)
      return !!wallet && liveKeplrMobileAddress(wallet, chainId) === address
    }
  }), [account?.address, chain.chainId, connectorId, getCosmosWallet, status])

  const ownsConnectionAttempt = useCallback((id: WalletConnectorId, attempt: number) => {
    if (id === "keplr" && !hasDesktopKeplrProvider()) return false
    const selected = pendingConnectorRef.current ?? selectedConnectorRef.current ??
      getStoredWalletConnectorId()
    return attempt === connectionAttemptRef.current &&
      !manualDisconnectRef.current && (!selected || selected === id)
  }, [])

  const syncCosmosWalletAccount = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS, wallet: ChainWalletBase, attempt: number, restoredAddress?: string) => {
      if (!ownsConnectionAttempt(id, attempt)) return false

      const nextAccount = restoredAddress ? { address: restoredAddress, name: wallet.walletPrettyName } : buildWalletAccount(wallet)
      if (!nextAccount) return false
      if (id === "keplr-mobile" && liveKeplrMobileAddress(wallet, chain.chainId) !== nextAccount.address) return false

      selectedConnectorRef.current = id
      setAccount((current) =>
        current?.address === nextAccount.address && current?.name === nextAccount.name
          ? current
          : nextAccount
      )
      setConnectorId((current) => (current === id ? current : id))
      setStatus("connected")
      setError(undefined)
      rememberWalletConnectorId(id)
      setStoredAutoConnectId(id)
      return true
    },
    [chain.chainId, ownsConnectionAttempt]
  )

  const ensureCosmosWalletSession = useCallback(
    async (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      wallet: ChainWalletBase,
      options?: { forceConnect?: boolean }
    ) => {
      const attempt = connectionAttemptRef.current
      if (!ownsConnectionAttempt(id, attempt)) {
        throw new Error("Wallet connection changed. Connect again before continuing.")
      }
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const shouldForceConnect = Boolean(options?.forceConnect && isMobileWallet)

      if (shouldForceConnect) {
        wallet.offlineSigner = undefined
      }

      if (wallet.isWalletDisconnected || shouldForceConnect) {
        await wallet.connect(false)
      } else if (!wallet.address) {
        await wallet.update({ connect: false })
      }

      if (!wallet.address && isMobileWallet) {
        wallet.offlineSigner = undefined
        await wallet.connect(false)
      }

      await waitForWalletAddress(wallet, isMobileWallet ? 12 : 8, 200)
      if (!wallet.address) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} account unavailable`)
      }

      if (!syncCosmosWalletAccount(id, wallet, attempt)) {
        throw new Error("Wallet connection changed. Connect again before continuing.")
      }
    },
    [ownsConnectionAttempt, syncCosmosWalletAccount]
  )

  const runWithCosmosWalletSessionRetry = useCallback(
    async <T,>(
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      wallet: ChainWalletBase,
      operation: () => Promise<T>
    ): Promise<T> => {
      await ensureCosmosWalletSession(id, wallet)

      if (COSMOS_CONNECTOR_CONFIGS[id].type !== "mobile") {
        return operation()
      }

      return runWithWalletInitializationRetry(operation, async () => {
        wallet.offlineSigner = undefined
        await ensureCosmosWalletSession(id, wallet, { forceConnect: true })
      })
    },
    [ensureCosmosWalletSession]
  )

  const hydrateMobileWalletSession = useCallback(
    async (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      options?: { allowWalletOpen?: boolean; warmSigner?: boolean }
    ) => {
      const attempt = connectionAttemptRef.current
      if (!ownsConnectionAttempt(id, attempt)) return false
      if (COSMOS_CONNECTOR_CONFIGS[id].type !== "mobile" || desktopKeplrAvailable) {
        return false
      }

      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet || wallet.isWalletNotExist) {
        return false
      }

      const stillOwned = () => ownsConnectionAttempt(id, attempt) &&
        getActiveAppChainKey() === chainKey && !pendingConnectorRef.current
      if (!stillOwned()) return false
      try {
        const liveAddress = await restoreKeplrMobileAddress(wallet, chain.chainId, stillOwned)
        if (!stillOwned()) return false
        if (!options?.allowWalletOpen) {
          if (liveAddress) return syncCosmosWalletAccount(id, wallet, attempt, liveAddress)
          if (accountAddressRef.current && connectorIdRef.current === id) {
            setAccount(undefined)
            setStatus("disconnected")
          }
          return false
        }
        if (liveAddress) {
          await wallet.update({ connect: false })
        } else {
          await ensureCosmosWalletSession(id, wallet, { forceConnect: true })
        }
        await waitForWalletAddress(wallet, 8, 150)
        if (!wallet.address && options?.allowWalletOpen) {
          await wallet.connect(false)
          await waitForWalletAddress(wallet, 8, 150)
        }
        if (!wallet.address) {
          return false
        }

        if (!syncCosmosWalletAccount(id, wallet, attempt)) return false

        if (options?.allowWalletOpen && options?.warmSigner) {
          try {
            wallet.offlineSigner = undefined
            await wallet.initOfflineSigner("amino")
          } catch (warmError) {
            if (!isWalletInitializationError(warmError)) {
              // Interactive signer warm-up is only a latency optimization.
            } else {
              try {
                wallet.offlineSigner = undefined
                await ensureCosmosWalletSession(id, wallet, {
                  forceConnect: true
                })
                await waitForWalletAddress(wallet, 12, 200)
                if (!wallet.address) {
                  return false
                }
                if (!syncCosmosWalletAccount(id, wallet, attempt)) return false
                await wallet.initOfflineSigner("amino")
              } catch (retryError) {
                if (isWalletInitializationError(retryError)) {
                  return false
                }
              }
            }
          }
        }

        return true
      } catch {
        return false
      }
    },
    [
      chain.chainId,
      chainKey,
      desktopKeplrAvailable,
      ensureCosmosWalletSession,
      getCosmosWallet,
      ownsConnectionAttempt,
      syncCosmosWalletAccount
    ]
  )

  const getCosmosConnector = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS): WalletConnector => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      if (id === "keplr") {
        return {
          id,
          label: config.label,
          type: config.type,
          available: desktopKeplrAvailable
        }
      }
      const wallet = getCosmosWallet(id)
      const available =
        config.type === "mobile"
          ? (!walletRepo || Boolean(wallet)) && supportsMobileWallets && !desktopKeplrAvailable
          : isWalletReady(wallet)

      return {
        id,
        label: config.label,
        type: config.type,
        available
      }
    },
    [desktopKeplrAvailable, getCosmosWallet, supportsMobileWallets, walletRepo]
  )

  const connectCosmosConnector = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS, readyRuntime?: WalletRuntimeChain) => {
      const wallet = getCosmosWallet(id, { runtime: readyRuntime })
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} not available`)
      }
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"

      if (isMobileWallet) {
        const attempt = connectionAttemptRef.current
        return connectKeplrMobile(wallet, chain.chainId, () =>
          ownsConnectionAttempt(id, attempt) && getActiveAppChainKey() === chainKey)
      }

      await wallet.connect(true)
      return buildWalletAccount(wallet)
    },
    [chain.chainId, chainKey, getCosmosWallet, ownsConnectionAttempt]
  )

  const getCosmosOfflineSigner = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = currentCosmosWallet
      const shouldUseChainSigner =
        !isMobileWallet &&
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain?.isWalletConnected

      if (shouldUseChainSigner && cosmosChain) {
        if (!cosmosChain.address) {
          await waitForWalletAddress(activeWallet!, 8, 150)
        }

        try {
          return cosmosChain.getOfflineSigner()
        } catch {
          // Fall back to the underlying wallet instance when Cosmos Kit has not
          // fully hydrated its signer yet.
        }
      }

      return runWithCosmosWalletSessionRetry(id, wallet, async () => {
        if (isMobileWallet) {
          wallet.offlineSigner = undefined
        }
        if (!wallet.offlineSigner) {
          await wallet.initOfflineSigner()
        }
        if (!wallet.offlineSigner) {
          throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
        }
        return wallet.offlineSigner
      })
    },
    [cosmosChain, currentCosmosWallet, getCosmosWallet, runWithCosmosWalletSessionRetry]
  )

  const getCosmosAminoOfflineSigner = useCallback(
    async (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS
    ): Promise<OfflineSigner | undefined> => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = currentCosmosWallet
      const shouldUseChainWallet =
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain?.isWalletConnected

      if (shouldUseChainWallet && !cosmosChain?.address) {
        await waitForWalletAddress(activeWallet!, 8, 150)
      }

      return runWithCosmosWalletSessionRetry(id, wallet, async () => {
        if (isMobileWallet) {
          wallet.offlineSigner = undefined
        }
        const aminoSigner = wallet.client?.getOfflineSignerAmino?.(chain.chainId)
        if (aminoSigner) {
          return aminoSigner
        }

        try {
          await wallet.initOfflineSigner("amino")
          if (wallet.offlineSigner) {
            return wallet.offlineSigner
          }
        } catch (err) {
          if (isWalletInitializationError(err)) {
            throw err
          }
          // Some wallets only expose direct signing; fall back to the default path.
        }

        return undefined
      })
    },
    [
      cosmosChain?.address,
      cosmosChain?.isWalletConnected,
      chain.chainId,
      currentCosmosWallet,
      getCosmosWallet,
      runWithCosmosWalletSessionRetry
    ]
  )


  const connectors = useMemo(
    () => {
      void connectorRefreshNonce
      return [
        getBurritoNativeConnector(),
        getBurritoExtensionConnector(),
        getCosmosConnector("keplr"),
        getCosmosConnector("keplr-mobile"),
        getGalaxyConnector()
      ]
    },
    [connectorRefreshNonce, getCosmosConnector]
  )

  const connect = useCallback(
    async (id: WalletConnectorId, requestApproval = true) => {
      if (!requestApproval && (manualDisconnectRef.current || isWalletManualDisconnectStored() ||
        (selectedConnectorRef.current && selectedConnectorRef.current !== id))) return
      if (pendingConnectorRef.current) return
      const attempt = ++connectionAttemptRef.current
      if (id !== "burrito-extension" && selectedConnectorRef.current === "burrito-extension") {
        invalidateBurritoExtensionSession()
      }
      if (
        id === "burrito-native" ||
        pendingConnectorRef.current === "burrito-native" ||
        connectorIdRef.current === "burrito-native"
      ) invalidateBurritoNativeSession()
      pendingConnectorRef.current = id
      selectedConnectorRef.current = id
      setConnectorId(id)
      manualDisconnectRef.current = false
      setStatus("connecting")
      setAccount(undefined)
      setError(undefined)
      try {
        let nextAccount: WalletAccount | undefined
        if (id === "keplr-mobile") {
          const readyRuntime = await waitForWalletRuntime()
          if (!readyRuntime || !ownsConnectionAttempt(id, attempt) ||
            getActiveAppChainKey() !== chainKey) return
          nextAccount = await connectCosmosConnector(id, readyRuntime)
        } else {
          const { connectWalletConnector } = await import("./walletAdapters")
          if (attempt !== connectionAttemptRef.current) return
          nextAccount = await connectWalletConnector(id, { requestApproval })
        }
        if (attempt !== connectionAttemptRef.current) return
        setConnectorId(id)
        rememberWalletConnectorId(id)
        setStoredAutoConnectId(id)
        if (nextAccount) {
          setAccount(nextAccount)
          setStatus("connected")
        } else {
          setStatus("disconnected")
        }
      } catch (err) {
        if (attempt !== connectionAttemptRef.current) return
        setStatus("error")
        setError(id === "burrito-extension"
          ? getBurritoExtensionConnectionErrorMessage(err)
          : id === "keplr"
            ? getKeplrConnectionErrorMessage(err)
            : formatWalletError(err))
      } finally {
        if (attempt === connectionAttemptRef.current) pendingConnectorRef.current = undefined
      }
    },
    [chainKey, connectCosmosConnector, ownsConnectionAttempt, waitForWalletRuntime]
  )

  useEffect(() => {
    if (previousChainKeyRef.current === chainKey) return

    previousChainKeyRef.current = chainKey
    const reconnectId = pendingConnectorRef.current ?? connectorIdRef.current ?? storedAutoConnectId
    connectionAttemptRef.current += 1
    pendingConnectorRef.current = undefined
    cancelRuntimeRequest()
    if (reconnectId === "burrito-extension") invalidateBurritoExtensionSession()
    if (reconnectId === "burrito-native") invalidateBurritoNativeSession()
    const shouldReconnect = Boolean(
      reconnectId &&
        !manualDisconnectRef.current &&
        !isWalletManualDisconnectStored()
    )

    setAccount(undefined)
    setError(undefined)
    setStatus("disconnected")
    setAutoConnectAttempted(true)
    lastAutoConnectRetryAtRef.current = 0
    refreshConnectors()

    if (!shouldReconnect || !reconnectId) return
    // Changing chains cancels an unstarted mobile handoff. Existing mobile
    // sessions are reconciled read-only once the new chain's bridge is ready.
    if (reconnectId === "keplr-mobile") return

    void connect(reconnectId, false)
  }, [cancelRuntimeRequest, chainKey, connect, refreshConnectors, storedAutoConnectId])

  useEffect(() => {
    const requestDesktopWalletReconnect = (id: WalletConnectorId) => {
      if (manualDisconnectRef.current || isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }

      const storedConnectorId = getStoredWalletConnectorId()
      const activeConnectorId = connectorIdRef.current
      if (storedConnectorId !== id && activeConnectorId !== id) return
      if (!ownsConnectionAttempt(id, connectionAttemptRef.current)) return

      setStoredAutoConnectId(id)
      setAccount(undefined)
      setError(undefined)
      setStatus("disconnected")
      setAutoConnectAttempted(false)
      refreshConnectors()
    }

    const handleKeplrChange = () => requestDesktopWalletReconnect("keplr")
    const handleGalaxyChange = () => requestDesktopWalletReconnect("galaxy")
    const handleBurritoNativeReady = () => refreshConnectors()
    const handleBurritoExtensionReady = () => refreshConnectors()
    const handleBurritoChange = () => {
      const selected = pendingConnectorRef.current ?? selectedConnectorRef.current ??
        connectorIdRef.current ?? getStoredWalletConnectorId()
      if (selected !== "burrito-extension") return
      connectionAttemptRef.current += 1
      pendingConnectorRef.current = undefined
      cancelRuntimeRequest()
      invalidateBurritoExtensionSession()
      selectedConnectorRef.current = undefined
      manualDisconnectRef.current = true
      rememberWalletManualDisconnect()
      forgetStoredWalletSession()
      setStoredAutoConnectId(undefined)
      setAutoConnectAttempted(true)
      setAccount(undefined)
      setConnectorId(undefined)
      setStatus("disconnected")
      setError(undefined)
    }

    window.addEventListener(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT, handleBurritoChange)
    window.addEventListener("burrito:native-ready", handleBurritoNativeReady)
    window.addEventListener("burrito:wallet-ready", handleBurritoExtensionReady)
    window.addEventListener("keplr_keystorechange", handleKeplrChange)
    window.addEventListener("galaxy_station_wallet_change", handleGalaxyChange)
    window.addEventListener("galaxy_station_network_change", handleGalaxyChange)

    return () => {
      window.removeEventListener(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT, handleBurritoChange)
      window.removeEventListener("burrito:native-ready", handleBurritoNativeReady)
      window.removeEventListener(
        "burrito:wallet-ready",
        handleBurritoExtensionReady
      )
      window.removeEventListener("keplr_keystorechange", handleKeplrChange)
      window.removeEventListener(
        "galaxy_station_wallet_change",
        handleGalaxyChange
      )
      window.removeEventListener(
        "galaxy_station_network_change",
        handleGalaxyChange
      )
    }
  }, [cancelRuntimeRequest, ownsConnectionAttempt, refreshConnectors])

  const disconnect = useCallback(async () => {
    const abandoningMobileApproval = pendingConnectorRef.current === "keplr-mobile"
    const disconnectId = pendingConnectorRef.current ?? connectorIdRef.current ?? getStoredWalletConnectorId()
    const attempt = ++connectionAttemptRef.current
    pendingConnectorRef.current = undefined
    cancelRuntimeRequest()
    if (disconnectId === "burrito-extension") invalidateBurritoExtensionSession()
    if (disconnectId === "burrito-native") invalidateBurritoNativeSession()
    selectedConnectorRef.current = undefined
    manualDisconnectRef.current = true
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()
    setStoredAutoConnectId(undefined)
    setAutoConnectAttempted(true)
    setAccount(undefined)
    setConnectorId(undefined)
    setError(undefined)
    setStatus("disconnected")

    // Stop listening locally. WalletConnect cannot revoke an in-flight remote
    // approval; do not delete every pairing or interpret a late approval as a new one.
    if (abandoningMobileApproval) return
    try {
      if (
        disconnectId &&
        !(disconnectId === "keplr" && desktopKeplrAvailable) &&
        isCosmosConnectorId(disconnectId) &&
        walletRepo?.current
      ) {
        await walletRepo.disconnect(undefined, true, {
          walletconnect: {
            removeAllPairings: true
          }
        })
      } else if (disconnectId) {
        const { disconnectWalletConnector } = await import("./walletAdapters")
        if (attempt !== connectionAttemptRef.current) return
        await disconnectWalletConnector(disconnectId)
      }
    } catch {
      // The local disconnect must still stick if a wallet SDK cannot end its session.
    }
    if (attempt === connectionAttemptRef.current) {
      rememberWalletManualDisconnect()
      forgetStoredWalletSession()
    }
  }, [cancelRuntimeRequest, desktopKeplrAvailable, walletRepo])

  const prepareWalletForTx = useCallback(async () => {
    const activeConnectorId = connectorIdRef.current
    if (!activeConnectorId || !accountAddressRef.current) {
      setError("Connect wallet before submitting a transaction.")
      return false
    }

    setWalletPreparingForTx(true)
    setError(undefined)
    const attempt = connectionAttemptRef.current
    try {
      if (
        isCosmosConnectorId(activeConnectorId) &&
        !(activeConnectorId === "keplr" && desktopKeplrAvailable)
      ) {
        const wallet =
          getCosmosWallet(activeConnectorId, { preferConnected: true }) ??
          getCosmosWallet(activeConnectorId)
        if (!wallet) {
          throw new Error(
            `${COSMOS_CONNECTOR_CONFIGS[activeConnectorId].label} signer not available`
          )
        }

        if (COSMOS_CONNECTOR_CONFIGS[activeConnectorId].type === "mobile") {
          const hydrated = await hydrateMobileWalletSession(activeConnectorId, {
            allowWalletOpen: true,
            warmSigner: true
          })
          if (!hydrated) {
            throw new Error("Wallet not sync")
          }
        }

        const signer =
          COSMOS_CONNECTOR_CONFIGS[activeConnectorId].type === "mobile"
            ? (await getCosmosAminoOfflineSigner(activeConnectorId)) ??
              (await getCosmosOfflineSigner(activeConnectorId))
            : await getCosmosOfflineSigner(activeConnectorId)
        const signerAddress = await getOfflineSignerAddress(signer)
        if (!ownsConnectionAttempt(activeConnectorId, attempt) ||
          getActiveAppChainKey() !== chainKey) return false
        const nextAccount = {
          address: signerAddress,
          name: wallet.username || wallet.walletPrettyName
        }
        setAccount((current) =>
          current?.address === nextAccount.address && current?.name === nextAccount.name
            ? current
            : nextAccount
        )
        setConnectorId((current) =>
          current === activeConnectorId ? current : activeConnectorId
        )
        setStatus("connected")
        rememberWalletConnectorId(activeConnectorId)
        setStoredAutoConnectId(activeConnectorId)
      } else {
        const { getSignerAddressForConnector } = await import("./walletAdapters")
        if (!ownsConnectionAttempt(activeConnectorId, attempt)) return false
        await getSignerAddressForConnector(activeConnectorId)
      }

      return ownsConnectionAttempt(activeConnectorId, attempt)
    } catch (prepareError) {
      const message = isWalletInitializationError(prepareError)
        ? "Wallet is still syncing. Return to the wallet if it opens, then try again."
        : formatWalletError(prepareError)
      if (ownsConnectionAttempt(activeConnectorId, attempt)) setError(message)
      return false
    } finally {
      setWalletPreparingForTx(false)
    }
  }, [
    chainKey,
    desktopKeplrAvailable,
    getCosmosAminoOfflineSigner,
    getCosmosOfflineSigner,
    getCosmosWallet,
    hydrateMobileWalletSession,
    ownsConnectionAttempt,
  ])


  useEffect(() => {
    const retryDelays = [250, 900, 1800, 3200]
    const timers = [0, ...retryDelays].map((delay) =>
      window.setTimeout(refreshConnectors, delay)
    )
    const requestStoredReconnect = () => {
      if (manualDisconnectRef.current || isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }

      const storedConnectorId = getStoredWalletConnectorId()
      if (!storedConnectorId) return
      if (!ownsConnectionAttempt(storedConnectorId, connectionAttemptRef.current)) return

      if (
        isCosmosConnectorId(storedConnectorId) &&
        COSMOS_CONNECTOR_CONFIGS[storedConnectorId].type === "mobile"
      ) {
        void hydrateMobileWalletSession(storedConnectorId)
        return
      }

      if (accountAddressRef.current) return
      if (walletStatusRef.current === "connecting") return
      if (walletStatusRef.current === "connected") return

      const now = Date.now()
      if (!canRetryWalletRecovery({
        visible: document.visibilityState === "visible",
        attempted: autoConnectAttemptedRef.current,
        pending: Boolean(pendingConnectorRef.current),
        status: walletStatusRef.current,
        now,
        lastAttemptAt: lastAutoConnectRetryAtRef.current,
        cooldownMs: AUTO_RECONNECT_RETRY_COOLDOWN_MS
      })) {
        return
      }

      lastAutoConnectRetryAtRef.current = now
      setStoredAutoConnectId(storedConnectorId)
      setAutoConnectAttempted(false)
    }
    // A late initial pageshow/focus is not a return from a wallet or another
    // window. Only an observed departure (or BFCache restore) permits recovery.
    let wasAway = document.visibilityState !== "visible"
    const handleBlur = () => { wasAway = true }
    const handleFocus = (event: Event) => {
      if (document.visibilityState !== "visible") {
        wasAway = true
        return
      }
      const resumed = wasAway ||
        (event.type === "pageshow" && (event as PageTransitionEvent).persisted)
      wasAway = false
      refreshConnectors()
      if (resumed) requestStoredReconnect()
    }
    window.addEventListener("blur", handleBlur)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("pageshow", handleFocus)
    document.addEventListener("visibilitychange", handleFocus)
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener("blur", handleBlur)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("pageshow", handleFocus)
      document.removeEventListener("visibilitychange", handleFocus)
    }
  }, [hydrateMobileWalletSession, ownsConnectionAttempt, refreshConnectors])

  useEffect(() => {
    if (!cosmosChain) return
    let cancelled = false
    let unregisterRuntime: (() => void) | undefined
    void import("./walletAdapters").then(({ registerWalletAdapterRuntime }) => {
      if (cancelled) return
      registerWalletAdapterRuntime({
      getConnector: (id) =>
        isCosmosConnectorId(id) ? getCosmosConnector(id) : undefined,
      connect: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
            ? await connectCosmosConnector(id)
            : undefined,
      getAminoOfflineSigner: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
          ? await getCosmosAminoOfflineSigner(id)
          : undefined,
      getOfflineSigner: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
            ? await getCosmosOfflineSigner(id)
            : undefined,
      })
      unregisterRuntime = () => registerWalletAdapterRuntime(undefined)
    }).catch((adapterError: unknown) => {
      if (cancelled) return
      reportRuntimeError({ kind: "react", error: adapterError })
      if (selectedConnectorRef.current === "keplr-mobile") {
        setError("Mobile wallet could not load. Reload the page to try again.")
      }
    })
    return () => {
      cancelled = true
      unregisterRuntime?.()
    }
  }, [
    connectCosmosConnector,
    cosmosChain,
    getCosmosAminoOfflineSigner,
    getCosmosConnector,
    getCosmosOfflineSigner,
    getCosmosWallet,
    runWithCosmosWalletSessionRetry,
    desktopKeplrAvailable
  ])

  useEffect(() => {
    if (!activeCosmosConnectorId || !cosmosChain?.isWalletConnected || !cosmosChain.address) {
      return
    }
    // Cached Cosmos Kit accounts are not a verified WC session. The mobile
    // handoff/restore path publishes only the live account for this chain.
    if (activeCosmosConnectorId === "keplr-mobile") return
    const attempt = connectionAttemptRef.current
    if (!ownsConnectionAttempt(activeCosmosConnectorId, attempt)) return
    if (manualDisconnectRef.current || isWalletManualDisconnectStored()) {
      forgetStoredWalletSession()
      return
    }
    if (connectorId === "keplr" && desktopKeplrAvailable) {
      return
    }
    const nextAccount = {
      address: cosmosChain.address,
      name: cosmosChain.username || cosmosChain.wallet?.prettyName
    }
    const timer = window.setTimeout(() => {
      if (!ownsConnectionAttempt(activeCosmosConnectorId, attempt)) return
      selectedConnectorRef.current = activeCosmosConnectorId
      setAccount((current) =>
        current?.address === nextAccount.address && current?.name === nextAccount.name
          ? current
          : nextAccount
      )
      setConnectorId((current) =>
        current === activeCosmosConnectorId ? current : activeCosmosConnectorId
      )
      setStatus("connected")
      setError(undefined)
      rememberWalletConnectorId(activeCosmosConnectorId)
      setStoredAutoConnectId(activeCosmosConnectorId)
      if (!autoConnectAttempted) {
        setAutoConnectAttempted(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    autoConnectAttempted,
    connectorId,
    cosmosChain?.address,
    cosmosChain?.isWalletConnected,
    cosmosChain?.username,
    cosmosChain?.wallet?.prettyName,
    desktopKeplrAvailable,
    ownsConnectionAttempt
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
    if (connectorId === "keplr" && desktopKeplrAvailable) return
    if (connectorId === "keplr-mobile") return
    if (status !== "connected") return
    if (cosmosChain?.isWalletConnected) return
    if (!cosmosChain) return
    if (activeCosmosConnectorId) return
    const timer = window.setTimeout(() => {
      setAccount(undefined)
      setStatus("disconnected")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    connectorId,
    cosmosChain,
    desktopKeplrAvailable,
    status
  ])

  const autoConnectAvailable = useMemo(
    () =>
      Boolean(
        effectiveAutoConnectId &&
          (!isCosmosConnectorId(effectiveAutoConnectId) ||
            COSMOS_CONNECTOR_CONFIGS[effectiveAutoConnectId].type !== "mobile") &&
          connectors.some(
            (connector) =>
              connector.id === effectiveAutoConnectId &&
              connector.available
          )
      ),
    [connectors, effectiveAutoConnectId]
  )

  useEffect(() => {
    if (pendingConnectorRef.current) return
    if (
      effectiveAutoConnectId &&
      isCosmosConnectorId(effectiveAutoConnectId) &&
      COSMOS_CONNECTOR_CONFIGS[effectiveAutoConnectId].type === "mobile"
    ) {
      if (manualDisconnectRef.current || isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }
      let cancelled = false
      const timer = window.setTimeout(() => {
        if (cancelled) return
        void hydrateMobileWalletSession(effectiveAutoConnectId)
        if (!autoConnectAttempted) {
          setAutoConnectAttempted(true)
        }
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    if (autoConnectAttempted || !effectiveAutoConnectId) return
    if (!autoConnectAvailable) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void connect(effectiveAutoConnectId, false).finally(() => {
        if (!cancelled) {
          setAutoConnectAttempted(true)
        }
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    autoConnectAttempted,
    connect,
    effectiveAutoConnectId,
    autoConnectAvailable,
    hydrateMobileWalletSession,
    supportsMobileWallets
  ])

  useEffect(() => {
    // On cold start the lazy SDK's wallet repo can exist before its client.
    // No connectorId is published until a verified account has been restored.
    const mobileId = connectorId ?? effectiveAutoConnectId
    if (mobileId !== "keplr-mobile" || desktopKeplrAvailable) return
    if (pendingConnectorRef.current || status === "connecting" || status === "error") return
    if (account?.address || status === "connected") return

    let cancelled = false

    const tryHydrate = async () => {
      const hydrated = await hydrateMobileWalletSession(mobileId)
      if (cancelled || hydrated) return
    }

    const timers = MOBILE_ACCOUNT_HYDRATION_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        void tryHydrate()
      }, delay)
    )

    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    account?.address,
    connectorId,
    effectiveAutoConnectId,
    desktopKeplrAvailable,
    hydrateMobileWalletSession,
    connectorRefreshNonce,
    status
  ])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connectorId,
      account,
      error,
      walletReadyForTx: Boolean(connectorId && account?.address),
      walletPreparingForTx,
      connectors,
      connect,
      disconnect,
      prepareWalletForTx,
      txState,
      startTx,
      finishTx,
      failTx,
      clearTx, setTxPhase, showTxReceipt, checkTxReceipt, acknowledgeTxReview
    }),
    [
      account,
      connectorId,
      connectors,
      connect,
      disconnect,
      error,
      walletPreparingForTx,
      prepareWalletForTx,
      status,
      txState,
      startTx,
      finishTx,
      failTx,
      clearTx, setTxPhase, showTxReceipt, checkTxReceipt, acknowledgeTxReview
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
