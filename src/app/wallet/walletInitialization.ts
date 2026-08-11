const getWalletErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return ""
}

export const isWalletInitializationError = (error: unknown) => {
  const message = getWalletErrorMessage(error).toLowerCase()
  return (
    (message.includes("not initialized") && message.includes("wallet")) ||
    (message.includes("not sync") && message.includes("wallet")) ||
    (message.includes("out of sync") && message.includes("wallet"))
  )
}

export const runWithWalletInitializationRetry = async <T>(
  operation: () => Promise<T>,
  recover: () => Promise<void>
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (!isWalletInitializationError(error)) {
      throw error
    }

    await recover()
    return operation()
  }
}
