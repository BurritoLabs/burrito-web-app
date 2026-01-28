const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

const charsetRev: Record<string, number> = CHARSET.split("").reduce(
  (acc, char, index) => {
    acc[char] = index
    return acc
  },
  {} as Record<string, number>
)

const polymod = (values: number[]) => {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  values.forEach((value) => {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GEN[i]
    }
  })
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
  for (let p = 0; p < 6; p += 1) {
    result.push((mod >> (5 * (5 - p))) & 31)
  }
  return result
}

const encodeBech32 = (hrp: string, data: number[]) => {
  const checksum = createChecksum(hrp, data)
  const combined = [...data, ...checksum]
  return `${hrp}1${combined.map((v) => CHARSET[v]).join("")}`
}

const decodeBech32 = (address: string) => {
  const lower = address.toLowerCase()
  const pos = lower.lastIndexOf("1")
  if (pos < 1) return null
  const hrp = lower.slice(0, pos)
  const dataPart = lower.slice(pos + 1)
  if (!dataPart.length) return null
  const data = dataPart.split("").map((char) => charsetRev[char])
  if (data.some((v) => v === undefined)) return null
  if (!verifyChecksum(hrp, data)) return null
  return { hrp, data: data.slice(0, -6) }
}

export const convertBech32Prefix = (
  address: string,
  newPrefix: string
) => {
  const decoded = decodeBech32(address)
  if (!decoded) return null
  return encodeBech32(newPrefix, decoded.data)
}

