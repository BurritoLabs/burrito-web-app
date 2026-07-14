type ChainSwitchLocation = {
  pathname: string
  search: string
}

const withoutChainSpecificParams = (
  pathname: string,
  search: string,
  names: readonly string[]
) => {
  const params = new URLSearchParams(search)
  const hadChainSpecificParam = names.some((name) => params.has(name))
  if (!hadChainSpecificParam) return undefined

  names.forEach((name) => params.delete(name))
  const nextSearch = params.toString()
  return nextSearch ? `${pathname}?${nextSearch}` : pathname
}

export const getChainSwitchDestination = ({
  pathname,
  search
}: ChainSwitchLocation) => {
  if (pathname.startsWith("/market/pair/")) return "/market"

  if (pathname === "/swap") {
    return withoutChainSpecificParams(pathname, search, ["from", "to"])
  }

  if (pathname === "/launchpad") {
    return withoutChainSpecificParams(pathname, search, ["launch"])
  }

  return undefined
}
