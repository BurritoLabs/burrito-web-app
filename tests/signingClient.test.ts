import { toUtf8 } from "@cosmjs/encoding"
import { describe, expect, it } from "vitest"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import {
  CLASSIC_SIGNING_RPC_ENDPOINTS,
  getClassicAminoTypes,
  isClassicEndpointRetryableError
} from "../src/app/wallet/signingClient"

describe("classic signing client", () => {
  it("registers CosmWasm execute messages for Amino signers", () => {
    const aminoTypes = getClassicAminoTypes()
    const amino = aminoTypes.toAmino({
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender: "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu",
        contract: "terra1qyp8uw49vxj8mpmjt9q0au58tv5dzummqavk82",
        msg: toUtf8(JSON.stringify({ swap: {} })),
        funds: []
      })
    })

    expect(amino.type).toBe("wasm/MsgExecuteContract")
    expect(amino.value.sender).toBe(
      "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"
    )
  })

  it("uses unique fallback RPC endpoints for transaction clients", () => {
    expect(CLASSIC_SIGNING_RPC_ENDPOINTS.length).toBeGreaterThan(1)
    expect(new Set(CLASSIC_SIGNING_RPC_ENDPOINTS).size).toBe(
      CLASSIC_SIGNING_RPC_ENDPOINTS.length
    )
  })

  it("retries endpoint rate limit errors but not chain errors", () => {
    expect(
      isClassicEndpointRetryableError(new Error("Bad status on response: 429"))
    ).toBe(true)
    expect(
      isClassicEndpointRetryableError(new Error("account sequence mismatch"))
    ).toBe(false)
  })
})
