export const DEFAULT_QUERY = '{\n  "token_info": {}\n}'
export const DEFAULT_INSTANTIATE_MSG = '{\n  "count": 0\n}'
export const DEFAULT_EXECUTE_MSG = "{\n  \n}"
export const DEFAULT_MIGRATE_MSG = "{\n  \n}"

export const toMicroAmount = (value: string) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

export const parseJsonRecord = (value: string, label: string) => {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

export const extractEventAttr = (
  events:
    | ReadonlyArray<{
        type: string
        attributes: ReadonlyArray<{ key: string; value: string }>
      }>
    | undefined,
  keys: string[]
) => {
  if (!events?.length) return undefined
  for (const event of events) {
    for (const attr of event.attributes ?? []) {
      if (keys.includes(attr.key)) return attr.value
    }
  }
  return undefined
}
