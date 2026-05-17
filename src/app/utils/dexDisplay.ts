export const splitDexLabel = (label: string) => {
  const trimmed = label.trim()
  const match = trimmed.match(/^(.*?)(?:\s+(V\d+|XYK))$/i)
  if (!match) return { dexName: trimmed, dexVersion: "" }
  return {
    dexName: match[1].trim(),
    dexVersion: match[2].toUpperCase()
  }
}
