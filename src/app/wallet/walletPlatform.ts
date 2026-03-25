const getPlatformSignals = () => {
  if (typeof window === "undefined") {
    return {
      userAgent: "",
      userAgentMobile: false,
      coarsePointer: false,
      noHover: false,
      maxTouchPoints: 0,
      minViewportEdge: 0
    }
  }

  const userAgent = window.navigator.userAgent || ""
  const userAgentData = (
    window.navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(any-pointer: coarse)").matches)
  const noHover =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(any-hover: none)").matches)
  const maxTouchPoints = window.navigator.maxTouchPoints || 0
  const minViewportEdge = Math.min(
    window.innerWidth || 0,
    window.innerHeight || 0,
    window.screen?.width || window.innerWidth || 0,
    window.screen?.height || window.innerHeight || 0
  )

  return {
    userAgent,
    userAgentMobile: userAgentData?.mobile === true,
    coarsePointer,
    noHover,
    maxTouchPoints,
    minViewportEdge
  }
}

export const isTouchWalletCapableBrowser = () => {
  const {
    coarsePointer,
    noHover,
    maxTouchPoints,
    minViewportEdge
  } = getPlatformSignals()

  if (maxTouchPoints > 0 && minViewportEdge <= 1366) {
    return true
  }

  if ((coarsePointer || noHover) && minViewportEdge <= 1366) {
    return true
  }

  return false
}

export const isLikelyMobileBrowser = () => {
  const {
    userAgent,
    userAgentMobile,
    coarsePointer,
    noHover,
    maxTouchPoints,
    minViewportEdge
  } = getPlatformSignals()

  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS/i.test(
      userAgent
    ) ||
    userAgentMobile
  ) {
    return true
  }

  if ((coarsePointer || noHover) && minViewportEdge <= 1280) {
    return true
  }

  return maxTouchPoints > 1 && minViewportEdge <= 1024
}
