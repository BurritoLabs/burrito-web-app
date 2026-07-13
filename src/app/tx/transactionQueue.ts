const transactionTails = new Map<string, Promise<void>>()

export const runSerializedTransaction = async <T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> => {
  const previous = transactionTails.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => gate)
  transactionTails.set(key, tail)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (transactionTails.get(key) === tail) {
      transactionTails.delete(key)
    }
  }
}
