import { describe, expect, it } from "vitest"
import { rateClientVital } from "./clientWebVitals"

describe("client web-vital ratings", () => {
  it("uses the Core Web Vitals boundaries", () => {
    expect(rateClientVital("CLS", 0.1)).toBe("good")
    expect(rateClientVital("CLS", 0.11)).toBe("needs-improvement")
    expect(rateClientVital("LCP", 2_500)).toBe("good")
    expect(rateClientVital("LCP", 2_501)).toBe("needs-improvement")
    expect(rateClientVital("INP", 501)).toBe("poor")
  })
})
