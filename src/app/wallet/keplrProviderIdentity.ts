type KeplrHost<T = unknown> = {
  keplr?: T
  BurritoKeplr?: unknown
}

// Burrito exposes a Keplr-compatible API for third-party DApps. Compatibility
// does not mean a separate Keplr installation or permission to relabel it.
export const getIndependentKeplrProvider = <T>(host?: KeplrHost<T>) => {
  const provider = host?.keplr
  if (!provider || provider === host?.BurritoKeplr) return undefined
  if (typeof provider !== "object") return undefined
  const version = (provider as { version?: unknown }).version
  if (typeof version === "string" && version.startsWith("burrito-compat-")) {
    return undefined
  }
  return provider
}

export const hasDesktopKeplrProvider = () =>
  typeof window !== "undefined" &&
  Boolean(getIndependentKeplrProvider(window as Window & KeplrHost))
