import JSON5 from "json5"

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

  let parsed: unknown
  try {
    parsed = JSON5.parse(expression)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unsupported ${sourceLabel} payload: ${message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Unsupported ${sourceLabel} payload`)
  }
  return parsed as T[]
}
