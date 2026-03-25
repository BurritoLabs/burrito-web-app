export const isLikelyMobileBrowser = () => {
  if (typeof window === "undefined") return false

  const userAgent = window.navigator.userAgent || ""
  const userAgentData = (
    window.navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  const noHover =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none)").matches

  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS/i.test(
      userAgent
    ) ||
    userAgentData?.mobile === true
  ) {
    return true
  }

  const maxTouchPoints = window.navigator.maxTouchPoints || 0
  const minViewportEdge = Math.min(
    window.innerWidth,
    window.innerHeight,
    window.screen?.width || window.innerWidth,
    window.screen?.height || window.innerHeight
  )

  if ((coarsePointer || noHover) && minViewportEdge <= 1280) {
    return true
  }

  return maxTouchPoints > 1 && minViewportEdge <= 1024
}
