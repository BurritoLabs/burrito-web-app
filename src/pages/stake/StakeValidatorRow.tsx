import type { SyntheticEvent } from "react"
import type { ValidatorItem } from "../../app/data/classic"
import { formatPercentPlain } from "../../app/stake/stakeFormat"
import styles from "../Stake.module.css"
import { getActiveAppChainKey } from "../../app/activeChain"

export type StakeValidatorRowTarget = {
  validator: string
  moniker: string
  amount: bigint
}

type StakeValidatorRowProps = {
  validator: ValidatorItem
  votingPower: number
  delegatedAmount: bigint
  icon: string
  actionLabel: string
  onLogoError: (event: SyntheticEvent<HTMLImageElement>) => void
  onManage: (target: StakeValidatorRowTarget) => void
}

const StakeValidatorRow = ({
  validator,
  votingPower,
  delegatedAmount,
  icon,
  actionLabel,
  onLogoError,
  onManage
}: StakeValidatorRowProps) => {
  const rate = Number(validator.commission?.commission_rates?.rate ?? 0)
  const moniker = validator.description?.moniker ?? validator.operator_address

  return (
    <div className={styles.validatorRow}>
      <div className={styles.validatorMonikerCell}>
        <span className={styles.validatorRowIconWrap}>
          <img
            className={styles.validatorRowIcon}
            src={icon}
            alt={validator.description?.moniker ?? "validator"}
            onError={onLogoError}
          />
        </span>
        <a
          className={styles.validatorRowLink}
          href={
            getActiveAppChainKey() === "lunc"
              ? `https://finder.burrito.money/classic/validator/${validator.operator_address}`
              : `https://www.mintscan.io/terra/validators/${validator.operator_address}`
          }
          target="_blank"
          rel="noreferrer"
        >
          <span className={styles.validatorRowLinkText}>
            {validator.description?.moniker ?? "--"}
          </span>
          <span className={styles.validatorRowLinkArrow} aria-hidden="true">
            {"\u2197"}
          </span>
        </a>
      </div>
      <div className={styles.validatorCell}>{formatPercentPlain(votingPower)}</div>
      <div className={styles.validatorCell}>
        {formatPercentPlain(rate * 100)}
      </div>
      <div className={styles.validatorActionCell}>
        <button
          type="button"
          className={styles.validatorActionButton}
          onClick={() =>
            onManage({
              validator: validator.operator_address,
              moniker,
              amount: delegatedAmount
            })
          }
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

export default StakeValidatorRow
