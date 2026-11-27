import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import type { ClassicStargateClient } from "../wallet/walletAdapters"

type SigningClient = Pick<ClassicStargateClient, "getSequence" | "sign" | "broadcastTx">
type SignArgs = Parameters<SigningClient["sign"]>
type Phase = "signing" | "confirming"

// One user decision authorizes one signature. broadcastTx owns receipt
// verification; neither a lost response nor a new sequence authorizes a retry.
export const signAndConfirmOnce = async ({
  client, signerAddress, messages, fee, memo, chainId, onPhase
}: {
  client: SigningClient
  signerAddress: string
  messages: SignArgs[1]
  fee: SignArgs[2]
  memo: string
  chainId: string
  onPhase: (phase: Phase) => void
}) => {
  const { accountNumber, sequence } = await client.getSequence(signerAddress)
  onPhase("signing")
  const signed = await client.sign(signerAddress, messages, fee, memo, { accountNumber, sequence, chainId })
  const bytes = TxRaw.encode(signed).finish()
  onPhase("confirming")
  const result = await client.broadcastTx(bytes, 60_000, 2_000)
  if (result.code !== 0) throw new Error(result.rawLog || `Transaction failed with code ${result.code}`)
  if (!result.transactionHash) throw new Error("Missing transaction receipt")
  return result.transactionHash
}
