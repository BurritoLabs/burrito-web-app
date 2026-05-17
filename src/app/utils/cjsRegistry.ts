export const parseCommonJsArray = <T,>(
  source: string,
  sourceLabel = "CJS"
): T[] => {
  const normalized = source.replace(/^\uFEFF/, "").trim()
  if (!/^module\.exports\s*=/.test(normalized)) {
    throw new Error(`Unsupported ${sourceLabel} format`)
  }
  const expression = normalized
    .replace(/^module\.exports\s*=\s*/, "")
    .replace(/;\s*$/, "")
  // Trusted registry payloads are fetched from the configured source URL.
  const parsed = new Function(`return (${expression})`)() as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`Unsupported ${sourceLabel} payload`)
  }
  return parsed as T[]
}
