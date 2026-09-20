import { useChain } from "@cosmos-kit/react-lite"
import type { ChainWalletBase } from "@cosmos-kit/core"
import type { OfflineSigner } from "@cosmjs/proto-signing"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useAppChain } from "../appChainContext"
import { getActiveAppChainKey } from "../activeChain"
import { classifyTxError, recordTxDiagnostic } from "../tx/txDiagnostics"
import {
  COSMOS_CONNECTOR_CONFIGS,
  COSMOS_KIT_CHAIN_NAME_BY_KEY,
  COSMOS_WALLET_NAME_TO_CONNECTOR_ID,
  isCosmosConnectorId
} from "./cosmosKit"
import { getGalaxyConnector } from "./galaxyWallet"
import { getBurritoNativeConnector } from "./burritoNativeWallet"
import { getBurritoExtensionConnector } from "./burritoExtensionWallet"
import {
  WalletContext,
  type WalletAccount,
  type TxState,
  type WalletConnector,
  type WalletConnectorId,
  type WalletContextValue,
  type WalletStatus
} from "./WalletContext"
import {
  type ClassicStargateClient,
  connectWalletConnector,
  disconnectWalletConnector,
  registerWalletAdapterRuntime
} from "./walletAdapters"
import { isTouchWalletCapableBrowser } from "./walletPlatform"
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
const MOBILE_CONNECT_HANDOFF_TIMEOUT_MS = 90
const MOBILE_ACCOUNT_HYDRATION_DELAYS_MS = [250, 1000, 2500, 5000] as const
const AUTO_RECONNECT_RETRY_COOLDOWN_MS = 15_000

type WalletConnectNamespace = {
  accounts?: string[]
}

type WalletConnectSession = {
  expiry?: number
  namespaces?: Record<string, WalletConnectNamespace>
  pairingTopic?: string
}

type WalletConnectPairing = {
  expiry?: number
  topic?: string
}

type WalletConnectRuntime = {
  pairing?: WalletConnectPairing
  pairings?: WalletConnectPairing[]
  restorePairings?: () => void
  restoreSessions?: () => void
  sessions?: WalletConnectSession[]
  signClient?: {
    session?: {
      getAll?: () => WalletConnectSession[]
    }
  }
}

const connectMobileWallet = async (wallet: ChainWalletBase) => {
  const attemptConnect = async (resetPairings: boolean) => {
    if (resetPairings) {
      try {
        await wallet.disconnect(false, {
          walletconnect: {
            removeAllPairings: true
          }
        })
      } catch {
        // Best-effort cleanup for stale WalletConnect sessions.
      }
    }

    const connectPromise = wallet.connect(true)
    const settled = await Promise.race([
      connectPromise.then(() => "resolved" as const),
      new Promise<"pending">((resolve) =>
        window.setTimeout(
          () => resolve("pending"),
          MOBILE_CONNECT_HANDOFF_TIMEOUT_MS
        )
      )
    ])

    if (settled === "pending") {
      void connectPromise.catch(() => {
        // The normal wallet state flow will surface follow-up errors.
      })
      return undefined
    }

    await waitForWalletAddress(wallet, 5, 150)
    return buildWalletAccount(wallet)
  }

  try {
    return await attemptConnect(false)
  } catch {
    return attemptConnect(true)
  }
}

const hasDesktopKeplrProvider = () =>
  typeof window !== "undefined" && Boolean((window as Window & { keplr?: unknown }).keplr)

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

const getWalletConnectRuntime = (wallet: ChainWalletBase) =>
  wallet.client as WalletConnectRuntime | undefined

const walletConnectSessionSupportsChain = (
  session: WalletConnectSession,
  chainId: string
) =>
  session.namespaces?.cosmos?.accounts?.some((account) =>
    account.startsWith(`cosmos:${chainId}:`)
  )

const walletConnectRecordIsActive = (record?: { expiry?: number }) =>
  !record?.expiry || record.expiry * 1000 > Date.now() + 1000

const getActiveWalletConnectSession = (
  wallet: ChainWalletBase,
  chainId: string
) => {
  const client = getWalletConnectRuntime(wallet)
  if (!client?.signClient) {
    return undefined
  }

  try {
    client.restorePairings?.()
    client.restoreSessions?.()
  } catch {
    return undefined
  }

  const activePairing = client.pairing ?? client.pairings?.find(walletConnectRecordIsActive)
  if (!activePairing?.topic || !walletConnectRecordIsActive(activePairing)) {
    return undefined
  }

  const sessions = [
    ...(client.signClient.session?.getAll?.() ?? []),
    ...(client.sessions ?? [])
  ]

  return sessions.find(
    (session) =>
      walletConnectRecordIsActive(session) &&
      session.pairingTopic === activePairing.topic &&
      walletConnectSessionSupportsChain(session, chainId)
  )
}

export const WalletProvider = ({
  children,
  connectOnMountId
}: {
  children: ReactNode
  connectOnMountId?: WalletConnectorId
}) => {
  const { chainKey, chain } = useAppChain()
  const cosmosChain = useChain(COSMOS_KIT_CHAIN_NAME_BY_KEY[chainKey])
  const [status, setStatus] = useState<WalletStatus>("disconnected")
  const [connectorId, setConnectorId] = useState<WalletConnectorId>()
  const [account, setAccount] = useState<WalletAccount>()
  const [error, setError] = useState<string>()
  const [txState, setTxState] = useState<TxState>({ status: "idle" })
  const [walletPreparingForTx, setWalletPreparingForTx] = useState(false)
  const currentTxLabelRef = useRef<string | undefined>(undefined)
  const currentTxStartedAtRef = useRef<number | undefined>(undefined)
  const accountAddressRef = useRef<string | undefined>(undefined)
  const connectorIdRef = useRef<WalletConnectorId | undefined>(undefined)
  const walletStatusRef = useRef<WalletStatus>("disconnected")
  const explicitConnectAttemptedRef = useRef(false)
  const lastAutoConnectRetryAtRef = useRef(0)
  const previousChainKeyRef = useRef(chainKey)
  const manualDisconnectRef = useRef(isWalletManualDisconnectStored())
  const [connectorRefreshNonce, setConnectorRefreshNonce] = useState(0)
  const [storedAutoConnectId, setStoredAutoConnectId] = useState<
    WalletConnectorId | undefined
  >(
    () => getStoredWalletConnectorId()
  )
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(
    () => !storedAutoConnectId
  )

  const supportsMobileWallets = useMemo(() => isTouchWalletCapableBrowser(), [])
  const currentCosmosWalletName = cosmosChain.walletRepo.current?.walletName
  const currentCosmosWallet = cosmosChain.walletRepo.current
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
    if (previousChainKeyRef.current === chainKey) return

    previousChainKeyRef.current = chainKey
    setAccount(undefined)
    setError(undefined)
    setTxState({ status: "idle" })
    setStatus("disconnected")
    setAutoConnectAttempted(false)
    lastAutoConnectRetryAtRef.current = 0
    refreshConnectors()
  }, [chainKey, refreshConnectors])

  useEffect(() => {
    accountAddressRef.current = account?.address
    connectorIdRef.current = connectorId
    walletStatusRef.current = status
  }, [account?.address, connectorId, status])

  const getCosmosWallet = useCallback(
    (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      options?: { preferConnected?: boolean }
    ) => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      const wallet =
        cosmosChain.walletRepo.getWallet(config.walletName) ??
        cosmosChain.walletRepo.wallets.find((item) =>
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
    [cosmosChain.walletRepo]
  )

  const syncCosmosWalletAccount = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS, wallet: ChainWalletBase) => {
      if (manualDisconnectRef.current) return

      const nextAccount = buildWalletAccount(wallet)
      if (!nextAccount) return

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
    },
    []
  )

  const ensureCosmosWalletSession = useCallback(
    async (
      id: keyof typeof COSMOS_CONNECTOR_CONFIGS,
      wallet: ChainWalletBase,
      options?: { forceConnect?: boolean }
    ) => {
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

      syncCosmosWalletAccount(id, wallet)
    },
    [syncCosmosWalletAccount]
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
      if (COSMOS_CONNECTOR_CONFIGS[id].type !== "mobile" || desktopKeplrAvailable) {
        return false
      }

      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet || wallet.isWalletNotExist) {
        return false
      }

      const hasActiveSession = Boolean(
        getActiveWalletConnectSession(wallet, chain.chainId)
      )
      if (!hasActiveSession && !options?.allowWalletOpen) {
        return false
      }

      try {
        if (hasActiveSession) {
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

        syncCosmosWalletAccount(id, wallet)

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
                syncCosmosWalletAccount(id, wallet)
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
      desktopKeplrAvailable,
      ensureCosmosWalletSession,
      getCosmosWallet,
      syncCosmosWalletAccount
    ]
  )

  const getCosmosConnector = useCallback(
    (id: keyof typeof COSMOS_CONNECTOR_CONFIGS): WalletConnector => {
      const config = COSMOS_CONNECTOR_CONFIGS[id]
      if (id === "keplr" && desktopKeplrAvailable) {
        return {
          id,
          label: config.label,
          type: config.type,
          available: true
        }
      }
      const wallet = getCosmosWallet(id)
      const available =
        config.type === "mobile"
          ? Boolean(wallet) && supportsMobileWallets && !desktopKeplrAvailable
          : isWalletReady(wallet)

      return {
        id,
        label: config.label,
        type: config.type,
        available
      }
    },
    [desktopKeplrAvailable, getCosmosWallet, supportsMobileWallets]
  )

  const connectCosmosConnector = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const wallet = getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} not available`)
      }
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"

      if (isMobileWallet) {
        return connectMobileWallet(wallet)
      }

      await wallet.connect(true)
      return buildWalletAccount(wallet)
    },
    [getCosmosWallet]
  )

  const getCosmosOfflineSigner = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const activeWallet = cosmosChain.walletRepo.current
      const shouldUseChainSigner =
        !isMobileWallet &&
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain.isWalletConnected

      if (shouldUseChainSigner) {
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
    [cosmosChain, getCosmosWallet, runWithCosmosWalletSessionRetry]
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
        cosmosChain.isWalletConnected

      if (shouldUseChainWallet && !cosmosChain.address) {
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
      cosmosChain.address,
      cosmosChain.isWalletConnected,
      chain.chainId,
      currentCosmosWallet,
      getCosmosWallet,
      runWithCosmosWalletSessionRetry
    ]
  )

  const getCosmosSigningStargateClient = useCallback(
    async (id: keyof typeof COSMOS_CONNECTOR_CONFIGS) => {
      const isMobileWallet = COSMOS_CONNECTOR_CONFIGS[id].type === "mobile"
      const wallet =
        getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
      if (!wallet) {
        throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} signer not available`)
      }

      const wrapStargateClient = (
        client: ClassicStargateClient,
        signerAddress: string,
        signAndBroadcastImpl?: (
          messages: Parameters<ClassicStargateClient["signAndBroadcast"]>[1],
          fee: Parameters<ClassicStargateClient["signAndBroadcast"]>[2],
          memo?: string
          ) => ReturnType<ClassicStargateClient["signAndBroadcast"]>
      ): ClassicStargateClient => {
        const assertTransactionContext = () => {
          if (getActiveAppChainKey() !== chainKey) {
            throw new Error(
              "The selected chain changed before signing. Review the transaction and try again."
            )
          }
          if (wallet.address && wallet.address !== signerAddress) {
            throw new Error(
              "Wallet account changed before signing. Review the transaction and try again."
            )
          }
        }

        return {
        ...client,
        simulate: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["simulate"]>[1],
          memo: string
        ) => {
          assertTransactionContext()
          return client.simulate(signerAddress, messages, memo)
        },
        sign: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["sign"]>[1],
          fee: Parameters<ClassicStargateClient["sign"]>[2],
          memo: string,
          signerData: Parameters<ClassicStargateClient["sign"]>[4]
        ) => {
          assertTransactionContext()
          return client.sign(signerAddress, messages, fee, memo, signerData)
        },
        signAndBroadcast: (
          _signerAddress: string,
          messages: Parameters<ClassicStargateClient["signAndBroadcast"]>[1],
          fee: Parameters<ClassicStargateClient["signAndBroadcast"]>[2],
          memo = ""
        ) => {
          assertTransactionContext()
          return signAndBroadcastImpl
            ? signAndBroadcastImpl(messages, fee, memo)
            : client.signAndBroadcast(signerAddress, messages, fee, memo)
        },
        getSequence: (address: string) => client.getSequence(address),
        broadcastTx: (
          tx: Parameters<ClassicStargateClient["broadcastTx"]>[0],
          timeoutMs?: Parameters<ClassicStargateClient["broadcastTx"]>[1],
          pollIntervalMs?: Parameters<ClassicStargateClient["broadcastTx"]>[2]
        ) => {
          assertTransactionContext()
          return client.broadcastTx(tx, timeoutMs, pollIntervalMs)
        },
        broadcastTxSync: (tx: Parameters<ClassicStargateClient["broadcastTxSync"]>[0]) => {
          assertTransactionContext()
          return client.broadcastTxSync(tx)
        },
        delegateTokens: (
          _delegatorAddress: string,
          validatorAddress: Parameters<ClassicStargateClient["delegateTokens"]>[1],
          amount: Parameters<ClassicStargateClient["delegateTokens"]>[2],
          fee: Parameters<ClassicStargateClient["delegateTokens"]>[3],
          memo?: Parameters<ClassicStargateClient["delegateTokens"]>[4]
        ) => {
          assertTransactionContext()
          return client.delegateTokens(signerAddress, validatorAddress, amount, fee, memo)
        },
        undelegateTokens: (
          _delegatorAddress: string,
          validatorAddress: Parameters<ClassicStargateClient["undelegateTokens"]>[1],
          amount: Parameters<ClassicStargateClient["undelegateTokens"]>[2],
          fee: Parameters<ClassicStargateClient["undelegateTokens"]>[3],
          memo?: Parameters<ClassicStargateClient["undelegateTokens"]>[4]
        ) => {
          assertTransactionContext()
          return client.undelegateTokens(signerAddress, validatorAddress, amount, fee, memo)
        }
        }
      }

      const assertClientChain = async (client: ClassicStargateClient) => {
        const chainReader = client as ClassicStargateClient & {
          getChainId?: () => Promise<string>
        }
        if (typeof chainReader.getChainId !== "function") {
          throw new Error("Wallet RPC chain identity is unavailable.")
        }
        const actualChainId = await chainReader.getChainId()
        if (actualChainId !== chain.chainId) {
          throw new Error(
            `Wallet RPC chain mismatch. Expected ${chain.chainId}, received ${actualChainId}.`
          )
        }
      }

      const activeWallet = currentCosmosWallet
      const shouldUseChainClient =
        !isMobileWallet &&
        Boolean(activeWallet) &&
        activeWallet?.walletName === wallet.walletName &&
        cosmosChain.isWalletConnected

      if (shouldUseChainClient) {
        if (!cosmosChain.address) {
          await waitForWalletAddress(activeWallet!, 8, 150)
        }

        try {
          const signerAddress = await getOfflineSignerAddress(
            await getCosmosOfflineSigner(id)
          )
          const client = await cosmosChain.getSigningStargateClient()
          await assertClientChain(client)
          return wrapStargateClient(client, signerAddress, (messages, fee, memo = "") =>
            cosmosChain.signAndBroadcast([...messages], fee as never, memo, "stargate")
          )
        } catch {
          // Fall back to the wallet instance when the chain hook client is not hydrated yet.
        }
      }

      try {
        return await runWithCosmosWalletSessionRetry(id, wallet, async () => {
          if (isMobileWallet) {
            wallet.offlineSigner = undefined
          }
          const signerAddress =
            wallet.address ||
            (await getOfflineSignerAddress(await getCosmosOfflineSigner(id)))
          const client = await wallet.getSigningStargateClient()
          await assertClientChain(client)
          return wrapStargateClient(
              client,
              signerAddress,
              (messages, fee, memo = "") =>
                runWithCosmosWalletSessionRetry(id, wallet, async () => {
                  if (isMobileWallet) {
                    wallet.offlineSigner = undefined
                  }
                  return wallet.signAndBroadcast(
                    [...messages],
                    fee as never,
                    memo,
                    "stargate"
                  )
                })
            )
        })
      } catch {
        return undefined
      }
    },
    [
      chainKey,
      chain.chainId,
      cosmosChain,
      currentCosmosWallet,
      getCosmosOfflineSigner,
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
    async (id: WalletConnectorId) => {
      manualDisconnectRef.current = false
      setStatus("connecting")
      setAccount(undefined)
      setError(undefined)
      try {
        const nextAccount =
          id === "keplr" && desktopKeplrAvailable
            ? await connectWalletConnector(id)
            : isCosmosConnectorId(id)
              ? await connectCosmosConnector(id)
              : await connectWalletConnector(id)
        setConnectorId(id)
        rememberWalletConnectorId(id)
        setStoredAutoConnectId(id)
        if (nextAccount) {
          setAccount(nextAccount)
          setStatus("connected")
        } else {
          // Mobile wallets often hand control to the native app first and only
          // hydrate the address after the page regains focus. Don't keep the UI
          // stuck in "connecting" while we wait for Cosmos Kit to reconcile.
          setStatus("disconnected")
        }
      } catch (err) {
        setStatus("error")
        setError(formatWalletError(err))
      }
    },
    [connectCosmosConnector, desktopKeplrAvailable]
  )

  useEffect(() => {
    const requestDesktopWalletReconnect = (id: WalletConnectorId) => {
      if (manualDisconnectRef.current || isWalletManualDisconnectStored()) {
        forgetStoredWalletSession()
        return
      }

      const storedConnectorId = getStoredWalletConnectorId()
      const activeConnectorId = connectorIdRef.current
      if (storedConnectorId !== id && activeConnectorId !== id) return

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

    window.addEventListener("burrito:native-ready", handleBurritoNativeReady)
    window.addEventListener("burrito:wallet-ready", handleBurritoExtensionReady)
    window.addEventListener("keplr_keystorechange", handleKeplrChange)
    window.addEventListener("galaxy_station_wallet_change", handleGalaxyChange)
    window.addEventListener("galaxy_station_network_change", handleGalaxyChange)

    return () => {
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
  }, [refreshConnectors])

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()
    setStoredAutoConnectId(undefined)
    setAutoConnectAttempted(true)
    setAccount(undefined)
    setConnectorId(undefined)
    setError(undefined)
    setStatus("disconnected")

    try {
      if (
        connectorId &&
        !(connectorId === "keplr" && desktopKeplrAvailable) &&
        isCosmosConnectorId(connectorId) &&
        cosmosChain.walletRepo.current
      ) {
        await cosmosChain.walletRepo.disconnect(undefined, true, {
          walletconnect: {
            removeAllPairings: true
          }
        })
      } else if (connectorId) {
        await disconnectWalletConnector(connectorId)
      }
    } catch {
      // The local disconnect must still stick if a wallet SDK cannot end its session.
    }
    rememberWalletManualDisconnect()
    forgetStoredWalletSession()
  }, [connectorId, cosmosChain.walletRepo, desktopKeplrAvailable])

  const prepareWalletForTx = useCallback(async () => {
    const activeConnectorId = connectorIdRef.current
    if (!activeConnectorId || !accountAddressRef.current) {
      setError("Connect wallet before submitting a transaction.")
      return false
    }

    setWalletPreparingForTx(true)
    setError(undefined)
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
      }

      return true
    } catch (prepareError) {
      const message = isWalletInitializationError(prepareError)
        ? "Wallet is still syncing. Return to the wallet if it opens, then try again."
        : formatWalletError(prepareError)
      setError(message)
      return false
    } finally {
      setWalletPreparingForTx(false)
    }
  }, [
    desktopKeplrAvailable,
    getCosmosAminoOfflineSigner,
    getCosmosOfflineSigner,
    getCosmosWallet,
    hydrateMobileWalletSession,
  ])

  const startTx = useCallback((label?: string) => {
    const startedAt = Date.now()
    currentTxLabelRef.current = label
    currentTxStartedAtRef.current = startedAt
    recordTxDiagnostic({
      phase: "start",
      label,
      connectorId,
      accountAddress: account?.address
    })
    setTxState({ status: "pending", label, startedAt })
  }, [account?.address, connectorId])

  const finishTx = useCallback((hash?: string) => {
    const durationMs = currentTxStartedAtRef.current
      ? Date.now() - currentTxStartedAtRef.current
      : undefined
    recordTxDiagnostic({
      phase: "success",
      label: currentTxLabelRef.current,
      connectorId,
      accountAddress: account?.address,
      txHash: hash,
      durationMs
    })
    currentTxLabelRef.current = undefined
    currentTxStartedAtRef.current = undefined
    setTxState({ status: "success", hash })
  }, [account?.address, connectorId])

  const failTx = useCallback((err?: unknown) => {
    const durationMs = currentTxStartedAtRef.current
      ? Date.now() - currentTxStartedAtRef.current
      : undefined
    const classified = classifyTxError(err, "Transaction failed")
    recordTxDiagnostic({
      phase: "failure",
      label: currentTxLabelRef.current,
      connectorId,
      accountAddress: account?.address,
      category: classified.category,
      message: classified.userMessage,
      rawMessage: classified.rawMessage,
      durationMs
    })
    currentTxLabelRef.current = undefined
    currentTxStartedAtRef.current = undefined
    setTxState({ status: "error", error: classified.userMessage })
  }, [account?.address, connectorId])

  const clearTx = useCallback(() => {
    setTxState({ status: "idle" })
  }, [])

  useEffect(() => {
    if (txState.status === "pending") {
      const timer = window.setTimeout(() => {
        setTxState((current) =>
          current.status === "pending" ? { status: "idle" } : current
        )
      }, 90_000)
      return () => window.clearTimeout(timer)
    }
    if (txState.status === "success" || txState.status === "error") {
      const timer = window.setTimeout(
        () => setTxState({ status: "idle" }),
        6000
      )
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [txState.status])

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
      if (
        now - lastAutoConnectRetryAtRef.current <
        AUTO_RECONNECT_RETRY_COOLDOWN_MS
      ) {
        return
      }

      lastAutoConnectRetryAtRef.current = now
      setStoredAutoConnectId(storedConnectorId)
      setAutoConnectAttempted(false)
    }
    const handleFocus = () => {
      refreshConnectors()
      requestStoredReconnect()
    }
    window.addEventListener("focus", handleFocus)
    window.addEventListener("pageshow", handleFocus)
    document.addEventListener("visibilitychange", handleFocus)
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("pageshow", handleFocus)
      document.removeEventListener("visibilitychange", handleFocus)
    }
  }, [hydrateMobileWalletSession, refreshConnectors])

  useEffect(() => {
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
      getSigningStargateClient: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
          ? await getCosmosSigningStargateClient(id)
          : undefined,
      getOfflineSigner: async (id) =>
        id === "keplr" && desktopKeplrAvailable
          ? undefined
          : isCosmosConnectorId(id)
            ? await getCosmosOfflineSigner(id)
            : undefined,
      runWithSessionRetry: async (id, operation) => {
        if (!isCosmosConnectorId(id)) {
          return operation()
        }
        const wallet =
          getCosmosWallet(id, { preferConnected: true }) ?? getCosmosWallet(id)
        if (!wallet) {
          throw new Error(`${COSMOS_CONNECTOR_CONFIGS[id].label} not available`)
        }
        return runWithCosmosWalletSessionRetry(id, wallet, operation)
      }
    })
    return () => {
      registerWalletAdapterRuntime(undefined)
    }
  }, [
    connectCosmosConnector,
    cosmosChain.isWalletConnected,
    cosmosChain.walletRepo,
    getCosmosAminoOfflineSigner,
    getCosmosConnector,
    getCosmosSigningStargateClient,
    getCosmosOfflineSigner,
    getCosmosWallet,
    runWithCosmosWalletSessionRetry,
    desktopKeplrAvailable
  ])

  useEffect(() => {
    if (!activeCosmosConnectorId || !cosmosChain.isWalletConnected || !cosmosChain.address) {
      return
    }
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
    cosmosChain.address,
    cosmosChain.isWalletConnected,
    cosmosChain.username,
    cosmosChain.wallet?.prettyName,
    desktopKeplrAvailable
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
    if (connectorId === "keplr" && desktopKeplrAvailable) return
    if (status !== "connected") return
    if (cosmosChain.isWalletConnected) return
    if (activeCosmosConnectorId) return
    const timer = window.setTimeout(() => {
      setAccount(undefined)
      setStatus("disconnected")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    activeCosmosConnectorId,
    connectorId,
    cosmosChain.isWalletConnected,
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
    if (!connectOnMountId || explicitConnectAttemptedRef.current) return
    if (
      !connectors.some(
        (connector) =>
          connector.id === connectOnMountId && connector.available
      )
    ) {
      return
    }

    explicitConnectAttemptedRef.current = true
    void connect(connectOnMountId)
  }, [connect, connectOnMountId, connectors])

  useEffect(() => {
    if (connectOnMountId) return
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
      void connect(effectiveAutoConnectId).finally(() => {
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
    connectOnMountId,
    effectiveAutoConnectId,
    autoConnectAvailable,
    hydrateMobileWalletSession,
    supportsMobileWallets
  ])

  useEffect(() => {
    if (!connectorId || !isCosmosConnectorId(connectorId)) return
    if (connectorId === "keplr" && desktopKeplrAvailable) return
    if (account?.address || status === "connected") return

    let cancelled = false

    const tryHydrate = async () => {
      const hydrated = await hydrateMobileWalletSession(connectorId)
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
      clearTx
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
      clearTx
    ]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
