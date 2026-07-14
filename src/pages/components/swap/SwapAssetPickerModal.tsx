import { createPortal } from "react-dom"
import styles from "../../Swap.module.css"
import { formatTokenAmount } from "../../../app/utils/format"
import SwapAssetIcon from "./SwapAssetIcon"

type SwapPickerTarget = "from" | "to"

type SwapPickerAsset = {
  id: string
  type: "native" | "cw20"
  symbol: string
  name: string
  decimals: number
  iconCandidates: string[]
}

type SwapAssetPickerModalProps = {
  assetBalanceMap: Map<string, bigint>
  fromAssetId: string
  onClose: () => void
  onPickAsset: (assetId: string) => void
  onQueryChange: (value: string) => void
  pickerAssets: SwapPickerAsset[]
  pickerQuery: string
  pickerTarget: SwapPickerTarget | null
  toAssetId: string
}

const formatAssetIdentity = (asset: SwapPickerAsset) => {
  const raw = asset.id.replace(/^(?:native|cw20):/, "")
  const compact = raw.length > 20 ? `${raw.slice(0, 10)}…${raw.slice(-6)}` : raw
  const type = asset.id.includes("ibc/") ? "IBC" : asset.type === "native" ? "Native" : "CW20"
  return `${type} · ${compact}`
}

const SwapAssetPickerModal = ({
  assetBalanceMap,
  fromAssetId,
  onClose,
  onPickAsset,
  onQueryChange,
  pickerAssets,
  pickerQuery,
  pickerTarget,
  toAssetId
}: SwapAssetPickerModalProps) => {
  if (!pickerTarget || typeof document === "undefined") return null

  return createPortal(
    <div
      className={styles.pickerBackdrop}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.pickerModal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <h3>Select token</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.pickerSearchRow}>
          <input
            type="text"
            value={pickerQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search token or address"
            autoFocus
          />
        </div>
        <div className={styles.pickerList}>
          {pickerAssets.map((asset) => {
            const isSelected =
              (pickerTarget === "from" && asset.id === fromAssetId) ||
              (pickerTarget === "to" && asset.id === toAssetId)
            return (
              <button
                key={asset.id}
                type="button"
                className={`${styles.pickerItem} ${
                  isSelected ? styles.pickerItemSelected : ""
                }`}
                onClick={() => onPickAsset(asset.id)}
              >
                <div className={styles.pickerItemLeft}>
                  <span className={styles.pickerItemIcon}>
                    <SwapAssetIcon
                      symbol={asset.symbol}
                      candidates={asset.iconCandidates}
                      size={22}
                    />
                  </span>
                  <span className={styles.pickerItemText}>
                    <strong>{asset.symbol}</strong>
                    <small>
                      {asset.name !== asset.symbol ? `${asset.name} · ` : ""}
                      {formatAssetIdentity(asset)} · Balance{" "}
                      {formatTokenAmount(
                        (assetBalanceMap.get(asset.id) ?? 0n).toString(),
                        asset.decimals,
                        6
                      )}{" "}
                      {asset.symbol}
                    </small>
                  </span>
                </div>
                {isSelected ? <span className={styles.pickerCheck}>✓</span> : null}
              </button>
            )
          })}
          {!pickerAssets.length ? (
            <div className={styles.pickerEmpty}>No token found.</div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default SwapAssetPickerModal
