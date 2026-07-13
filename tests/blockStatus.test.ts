import { afterEach, describe, expect, it, vi } from "vitest"
import { APP_CHAINS } from "../src/app/appChains"
import { fetchLatestBlock } from "../src/app/aside/blockStatusData"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("block status chain endpoint", () => {
  it.each(["lunc", "luna"] as const)(
    "loads the latest block from the %s LCD",
    async (chainKey) => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            block: {
              header: {
                height: "21893510",
                time: "2026-07-13T15:00:00.000Z"
              }
            }
          }),
          { status: 200 }
        )
      )
      vi.stubGlobal("fetch", fetchMock)

      const lcd = APP_CHAINS[chainKey].runtime.chain.lcd
      const result = await fetchLatestBlock(lcd)

      expect(fetchMock).toHaveBeenCalledWith(
        `${lcd}/cosmos/base/tendermint/v1beta1/blocks/latest`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(result.height).toBe(21_893_510)
      expect(result.endpoint).toBe(lcd)
    }
  )
})
