import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import PageShell from "../PageShell"
import SwapPanel from "../components/SwapPanel"

const isSwapAssetId = (value: string | null): value is string =>
  value !== null && (value.startsWith("native:") || value.startsWith("cw20:"))

const SwapPage = () => {
  const [searchParams] = useSearchParams()
  const defaultFromAssetId = useMemo(() => {
    const value = searchParams.get("from")
    return isSwapAssetId(value) ? value : undefined
  }, [searchParams])
  const defaultToAssetId = useMemo(() => {
    const value = searchParams.get("to")
    return isSwapAssetId(value) ? value : undefined
  }, [searchParams])

  return (
    <PageShell title="Swap">
      <SwapPanel
        key={`${defaultFromAssetId ?? "default"}:${defaultToAssetId ?? "default"}`}
        defaultFromAssetId={defaultFromAssetId}
        defaultToAssetId={defaultToAssetId}
      />
    </PageShell>
  )
}

export default SwapPage
