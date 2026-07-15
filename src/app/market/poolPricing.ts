export const supportsReserveRatioPricing = (poolType: string) =>
  !poolType.trim().toLowerCase().includes("concentrated")
