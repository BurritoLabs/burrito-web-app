import { ASSET_URL } from "../config/externalServices"
import { getActiveAppChainKey } from "../activeChain"

const KNOWN_STATIC_NATIVE_ICONS: Record<string, string> = {
  LUNC: "/system/lunc.svg",
  LUNA: "/system/luna.svg",
  USTC: "/system/ustc.png",
  UST: "/system/ustc.png"
}

const BLOCKED_ICON_HOSTS = new Set([
  "assets.pylon.rocks",
  "cdn.luart.io",
  "localterra.money",
  "files.pstake.finance",
  "terraoffice.world",
  "terra.nexusprotocol.app",
  "larry.engineer",
  "bj88com.feedback",
  "reactor.money",
  "astroport.fi",
  "app.astroport.fi",
  "app.kinetic.money",
  "whitelist.anchorprotocol.com",
  "pryzm.zone"
])

const EXTENSIONLESS_IMAGE_HOSTS = new Set([
  "cdn.fs.guides.co"
])

const IMAGE_EXT_RE = /\.(png|svg|webp|jpg|jpeg|gif|avif)$/i
const SAFE_ICON_LOOKUP_RE = /^[a-z0-9._+-]{1,32}$/i

const unique = (items: Array<string | undefined>) =>
  Array.from(new Set(items.filter(Boolean) as string[]))

const normalizeGithubBlobUrl = (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (host !== "github.com" && host !== "www.github.com") return url

  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 5 || parts[2] !== "blob") return url

  const [owner, repo, , ref, ...pathParts] = parts
  if (!owner || !repo || !ref || !pathParts.length) return url

  return new URL(
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathParts.join("/")}`
  )
}

const normalizeAssetsTerraUrl = (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (host !== "assets.terra.dev") return url
  if (!url.pathname.startsWith("/svg/")) return url

  const next = new URL(url.toString())
  next.pathname = `/icon${url.pathname}`
  return next
}

const sanitizeSymbolText = (value?: string) => {
  const normalized = (value ?? "")
    .slice(0, 64)
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
  return normalized.slice(0, 2) || "?"
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const CW20_AVATAR_PALETTES: Array<[string, string, string]> = [
  ["#2CEC5B", "#129A35", "#E9FFEF"],
  ["#31D8B4", "#0C8D72", "#ECFFFB"],
  ["#57E35F", "#1B7C2A", "#F2FFF2"],
  ["#8FEA3A", "#3A8E13", "#F6FFE6"],
  ["#4CD9F0", "#1280A0", "#EFFCFF"],
  ["#A6F042", "#4F9A12", "#FBFFEE"]
]

const buildGeneratedTokenIcon = (symbol?: string) => {
  const label = sanitizeSymbolText(symbol)
  const [start, end, text] = CW20_AVATAR_PALETTES[hashString(label) % CW20_AVATAR_PALETTES.length]
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`,
    `<title>${label} token</title>`,
    `<defs>`,
    `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${start}"/>`,
    `<stop offset="100%" stop-color="${end}"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect x="0" y="0" width="64" height="64" rx="32" fill="url(#g)"/>`,
    `<circle cx="21" cy="18" r="17" fill="rgba(255,255,255,0.14)"/>`,
    `<circle cx="49" cy="50" r="15" fill="rgba(0,0,0,0.10)"/>`,
    `<text x="32" y="38" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="${text}">${label}</text>`,
    `</svg>`
  ].join("")
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const sanitizeAssetIconUrl = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 2_048 && !trimmed.startsWith("data:image/")) return undefined
  if (trimmed.startsWith("/")) return trimmed
  if (trimmed.startsWith("data:image/")) return trimmed
  if (!/^https?:\/\//i.test(trimmed)) return undefined

  try {
    const url = normalizeAssetsTerraUrl(normalizeGithubBlobUrl(new URL(trimmed)))
    const host = url.hostname.toLowerCase()
    if (BLOCKED_ICON_HOSTS.has(host)) return undefined
    if (host === "imgur.com" && url.pathname.startsWith("/a/")) {
      return undefined
    }

    const hasImageExtension = IMAGE_EXT_RE.test(url.pathname)
    const queryFilename = url.searchParams.get("filename") ?? ""
    const looksLikeIpfsAsset =
      host.endsWith(".ipfs.dweb.link") ||
      host.endsWith(".mypinata.cloud") ||
      url.pathname.includes("/ipfs/")

    if (
      !hasImageExtension &&
      !IMAGE_EXT_RE.test(queryFilename) &&
      !looksLikeIpfsAsset &&
      !EXTENSIONLESS_IMAGE_HOSTS.has(host)
    ) {
      return undefined
    }

    return url.toString()
  } catch {
    return undefined
  }
}

export const buildClassicNativeIconCandidates = ({
  denom,
  symbol,
  primaryIcon,
  fallback = "/system/cw20.svg"
}: {
  denom: string
  symbol: string
  primaryIcon?: string
  fallback?: string
}) => {
  const upperSymbol = symbol.trim().toUpperCase()
  const staticIcon = KNOWN_STATIC_NATIVE_ICONS[upperSymbol]
  const legacyClassicStableSymbol =
    upperSymbol.endsWith("TC") && upperSymbol.length >= 4 ? upperSymbol.slice(0, -1) : undefined

  if (staticIcon) {
    return unique([sanitizeAssetIconUrl(primaryIcon), staticIcon, fallback])
  }

  const iconDenom =
    denom === "uluna"
      ? getActiveAppChainKey() === "lunc"
        ? "LUNC"
        : "LUNA"
      : symbol
  if (!SAFE_ICON_LOOKUP_RE.test(iconDenom)) {
    return unique([
      sanitizeAssetIconUrl(primaryIcon),
      fallback,
      buildGeneratedTokenIcon(symbol)
    ])
  }
  const upper = iconDenom.toUpperCase()

  if (getActiveAppChainKey() === "luna") {
    return unique([
      sanitizeAssetIconUrl(primaryIcon),
      fallback,
      buildGeneratedTokenIcon(symbol)
    ])
  }

  return unique([
    sanitizeAssetIconUrl(primaryIcon),
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${upper}.png`,
    legacyClassicStableSymbol ? `${ASSET_URL}/icon/60/${legacyClassicStableSymbol}.png` : undefined,
    buildGeneratedTokenIcon(symbol),
    fallback
  ])
}

const buildIbcStaticGuessCandidates = ({
  symbol,
  baseDenom
}: {
  symbol?: string
  baseDenom?: string
}) => {
  const candidates = new Set<string>()
  const tokens = new Set<string>()
  const addToken = (value?: string) => {
    const trimmed = value?.trim()
    if (!trimmed || !SAFE_ICON_LOOKUP_RE.test(trimmed)) return
    tokens.add(trimmed)
    tokens.add(trimmed.toUpperCase())
    tokens.add(trimmed.toLowerCase())
    if (trimmed.startsWith("u") && trimmed.length > 1) {
      const withoutMicro = trimmed.slice(1)
      tokens.add(withoutMicro)
      tokens.add(withoutMicro.toUpperCase())
      tokens.add(withoutMicro.toLowerCase())
    }
  }

  addToken(symbol)
  addToken(baseDenom)

  Array.from(tokens).forEach((token) => {
    candidates.add(`${ASSET_URL}/icon/60/${token}.png`)
    candidates.add(`${ASSET_URL}/icon/svg/${token}.svg`)
  })

  return Array.from(candidates).slice(0, 4)
}

export const buildIbcAssetIconCandidates = (
  icons: Array<string | undefined>,
  fallback = "/system/ibc.svg",
  options?: {
    symbol?: string
    baseDenom?: string
  }
) =>
  unique([
    ...icons.map((icon) => sanitizeAssetIconUrl(icon)),
    ...(getActiveAppChainKey() === "lunc"
      ? buildIbcStaticGuessCandidates(options ?? {})
      : []),
    fallback,
    buildGeneratedTokenIcon(options?.symbol)
  ])

export const buildCw20IconCandidates = (
  icon?: string,
  symbol?: string,
  fallback = "/system/cw20.svg"
) => unique([sanitizeAssetIconUrl(icon), fallback, buildGeneratedTokenIcon(symbol)])
