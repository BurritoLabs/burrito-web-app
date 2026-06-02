import { toUtf8 } from "@cosmjs/encoding"
import { describe, expect, it } from "vitest"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { getClassicAminoTypes } from "../src/app/wallet/signingClient"

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
})
