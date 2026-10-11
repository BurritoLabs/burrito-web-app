import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import "@burritolabs/ui/tokens.css"
import "../../../src/index.css"
import TxStatusModal from "../../../src/app/feedback/TxStatusModal"
import AppErrorBoundary from "../../../src/app/feedback/AppErrorBoundary"
import { WalletContext, type TxState } from "../../../src/app/wallet/WalletContext"

// Test-only entry: the product entry point never imports this module.
const qa = window as unknown as {
  qaFixtureKind: "transaction" | "runtime"
  qaSetTransaction: (state: TxState) => void
}
document.title = "Diagnostic copy QA fixture"

export function ThrowSyntheticError(): never {
  throw new Error("Synthetic QA runtime error")
}

const unexpectedWalletAction = async (): Promise<never> => {
  throw new Error("Wallet actions are forbidden in the diagnostic UI fixture")
}

export function Fixture() {
  const [txState, setTxState] = useState<TxState>({
    status: "error", error: "Synthetic QA transaction error"
  })
  useEffect(() => { qa.qaSetTransaction = setTxState }, [])
  if (qa.qaFixtureKind === "runtime") {
    return <AppErrorBoundary><ThrowSyntheticError /></AppErrorBoundary>
  }
  return (
    <WalletContext.Provider value={{
      status: "disconnected", walletReadyForTx: false, walletPreparingForTx: false,
      connectors: [], connect: unexpectedWalletAction, disconnect: unexpectedWalletAction,
      prepareWalletForTx: unexpectedWalletAction,
      startTx: () => { throw new Error("Synthetic fixture cannot start a transaction") },
      finishTx: () => { throw new Error("Synthetic fixture cannot finish a transaction") },
      failTx: () => { throw new Error("Synthetic fixture cannot fail a transaction") },
      txState, clearTx: () => setTxState({ status: "idle" })
    }}>
      <main>
        <button onClick={() => setTxState({ status: "error", error: "Synthetic next transaction error" })}>
          Open synthetic transaction
        </button>
        <TxStatusModal />
      </main>
    </WalletContext.Provider>
  )
}

createRoot(document.getElementById("root")!).render(<Fixture />)
