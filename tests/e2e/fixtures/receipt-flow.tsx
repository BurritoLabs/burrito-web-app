import { createRoot } from "react-dom/client"
import { useState } from "react"
import "@burritolabs/ui/tokens.css"
import "../../../src/index.css"
import TxStatusModal from "../../../src/app/feedback/TxStatusModal"
import { WalletContext } from "../../../src/app/wallet/WalletContext"
import { useTransactionReceipt } from "../../../src/app/tx/useTransactionReceipt"
import { noteSignedTxForConfirmation } from "../../../src/app/tx/receiptJournal"
import { TxConfirmationUnknownError } from "../../../src/app/tx/broadcastOutcome"

export function Fixture() {
  const receipt = useTransactionReceipt("luna")
  const [count, setCount] = useState(0)
  const forbidden = async (): Promise<never> => { throw new Error("No wallets in this fixture") }
  return <WalletContext.Provider value={{status:"disconnected", connectors:[], walletReadyForTx:false,
    walletPreparingForTx:false, connect:forbidden, disconnect:forbidden, prepareWalletForTx:forbidden, ...receipt}}>
    <button onClick={async () => {
      for (let click = 0; click < 2; click++) {
        if (!(await receipt.startTx("Synthetic transfer"))) continue
        setCount(n => n + 1)
        const hash = "AB".repeat(32)
        noteSignedTxForConfirmation(hash, "phoenix-1")
        receipt.failTx(new TxConfirmationUnknownError(hash, "phoenix-1"))
      }
    }}>Simulate repeated taps</button>
    <button onClick={async () => {
      if (!(await receipt.startTx("Synthetic transfer"))) return
      setCount(n => n + 1)
      await new Promise(resolve => window.addEventListener("fixture:lost-response", resolve, { once: true }))
      const hash = "AB".repeat(32)
      noteSignedTxForConfirmation(hash, "phoenix-1")
      receipt.failTx(new TxConfirmationUnknownError(hash, "phoenix-1"))
    }}>Begin waiting for wallet</button>
    <output aria-label="Accepted intents">{count}</output>
    <TxStatusModal />
  </WalletContext.Provider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
