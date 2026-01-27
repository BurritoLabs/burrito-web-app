const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
const CHARSET_REV: Record<string, number> = {}

for (let i = 0; i < CHARSET.length; i += 1) {
  CHARSET_REV[CHARSET[i]] = i
}

const polymod = (values: number[]) => {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < generators.length; i += 1) {
      if ((top >> i) & 1) chk ^= generators[i]
    }
  }
  return chk
}

const hrpExpand = (hrp: string) => {
  const result: number[] = []
  for (let i = 0; i < hrp.length; i += 1) {
    result.push(hrp.charCodeAt(i) >> 5)
  }
  result.push(0)
  for (let i = 0; i < hrp.length; i += 1) {
    result.push(hrp.charCodeAt(i) & 31)
  }
  return result
}

const verifyChecksum = (hrp: string, data: number[]) =>
  polymod([...hrpExpand(hrp), ...data]) === 1

const createChecksum = (hrp: string, data: number[]) => {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]
  const mod = polymod(values) ^ 1
  const result: number[] = []
  for (let i = 0; i < 6; i += 1) {
    result.push((mod >> (5 * (5 - i))) & 31)
  }
  return result
}

const bech32Encode = (hrp: string, data: number[]) => {
  const combined = [...data, ...createChecksum(hrp, data)]
  return `${hrp}1${combined.map((value) => CHARSET[value]).join("")}`
}

const bech32Decode = (address: string) => {
  if (address.length < 8) return null
  const hasLower = address !== address.toUpperCase()
  const hasUpper = address !== address.toLowerCase()
  if (hasLower && hasUpper) return null
  const normalized = address.toLowerCase()
  const pos = normalized.lastIndexOf("1")
  if (pos < 1 || pos + 7 > normalized.length) return null
  const hrp = normalized.slice(0, pos)
  const data = normalized
    .slice(pos + 1)
    .split("")
    .map((char) => CHARSET_REV[char])
  if (data.some((value) => value === undefined)) return null
  const words = data as number[]
  if (!verifyChecksum(hrp, words)) return null
  return { prefix: hrp, words: words.slice(0, -6) }
}

export const convertBech32Prefix = (address: string, newPrefix: string) => {
  const decoded = bech32Decode(address)
  if (!decoded) return null
  return bech32Encode(newPrefix, decoded.words)
}
