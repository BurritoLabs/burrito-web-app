import type { ChainWalletBase } from "@cosmos-kit/core"

// The installed Keplr WC adapter signs with the LAST SignClient session; its
// connect() restores the FIRST Keplr pairing. Never validate a different one.
type Session = {
  topic?: string
  pairingTopic?: string
  expiry?: number
  peer?: { metadata?: { name?: string } }
  namespaces?: { cosmos?: { accounts?: string[] } }
  sessionProperties?: Record<string, string>
}
type SignClient = { session?: { getAll?: () => Session[] } }
type Client = {
  signClient?: SignClient
  initSignClient?: () => Promise<void>
  initAppUrl?: () => Promise<void>
  isMobile?: boolean
  redirectHref?: string
  restorePairings?: () => void
  pairing?: { topic?: string; expiry?: number }
  keplr?: unknown
  initKeplrWCClient?: (client: SignClient, options: { sessionProperties?: Record<string, string> }) => void
}

const adapter = (wallet: ChainWalletBase) => wallet.client as Client | undefined
const active = (expiry?: number) => typeof expiry === "number" && expiry * 1000 > Date.now() + 1000
const initializing = new WeakMap<Client, Promise<void>>()

function currentSession(client: Client, chainId: string) {
  client.restorePairings?.()
  const pairing = client.pairing
  const session = client.signClient?.session?.getAll?.().at(-1)
  if (!pairing?.topic || !active(pairing.expiry) || !session?.topic || !active(session.expiry) ||
      session.peer?.metadata?.name !== "Keplr" || session.pairingTopic !== pairing.topic) return
  const prefix = `cosmos:${chainId}:`
  const addresses = session.namespaces?.cosmos?.accounts?.filter(item => item.startsWith(prefix))
  if (addresses?.length !== 1) return
  const address = addresses[0].slice(prefix.length)
  if (!address || address.includes(":")) return
  return { session, address }
}

export function liveKeplrMobileAddress(wallet: ChainWalletBase, chainId: string) {
  const client = adapter(wallet)
  if (!client?.signClient || !client.keplr) return
  try { return currentSession(client, chainId)?.address } catch { return undefined }
}

export async function restoreKeplrMobileAddress(wallet: ChainWalletBase, chainId: string, stillOwned: () => boolean) {
  const client = adapter(wallet)
  if (!client || !stillOwned()) return
  // initSignClient opens the relay and reads WC storage. Unlike init()/connect()
  // it does not pair, request wallet permission, or deep-link into Keplr.
  if (!client.signClient && client.initSignClient) {
    let pending = initializing.get(client)
    if (!pending) {
      pending = client.initSignClient().finally(() => initializing.delete(client))
      initializing.set(client, pending)
    }
    await pending
  }
  if (!client.signClient || !stillOwned()) return
  const match = currentSession(client, chainId)
  if (!match) return
  if (!client.keplr) client.initKeplrWCClient?.(client.signClient, { sessionProperties: match.session.sessionProperties })
  if (client.keplr) return match.address
}

const connecting = new WeakSet<object>()

export async function connectKeplrMobile(wallet: ChainWalletBase, chainId: string, stillOwned = () => true) {
  const identity = adapter(wallet) ?? wallet
  if (connecting.has(wallet) || connecting.has(identity)) throw new Error("A connection is already waiting in Keplr. Finish or decline it there first.")
  connecting.add(wallet)
  connecting.add(identity)
  try {
    const client = adapter(wallet)
    // Passive restoration only opened the relay. Prepare the deep link now
    // (and only now) if this explicit request needs a fresh pairing.
    if (client?.signClient && client.isMobile && !client.redirectHref && !currentSession(client, chainId)) await client.initAppUrl?.()
    if (!stillOwned()) throw new Error("Connection request is no longer active.")
    return await finishConnection(wallet, chainId)
  } finally {
    connecting.delete(wallet)
    connecting.delete(identity)
  }
}

async function finishConnection(wallet: ChainWalletBase, chainId: string) {
  // Do not sync_connect other activated chain wallets while awaiting approval.
  await wallet.connect(false)
  // Cosmos Kit throwErrors=false: denied/errored requests commonly RESOLVE.
  if (wallet.isWalletRejected) throw new Error("Connection declined in Keplr. No transaction was sent.")
  if (wallet.isWalletNotExist || wallet.isError) throw new Error("Keplr could not connect. Open Keplr, then try again.")
  if (!wallet.address || liveKeplrMobileAddress(wallet, chainId) !== wallet.address) {
    throw new Error("Keplr did not confirm an account on this network. Check the network in Keplr. If this keeps happening, disconnect Burrito in Keplr, then connect it again here.")
  }
  return { address: wallet.address, name: wallet.username || wallet.walletPrettyName }
}
