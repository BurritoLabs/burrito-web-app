import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from "react"
import { getLaunchpadCreationFeeLabel } from "../../app/config/launchpadConfig"
import { useAppChain } from "../../app/appChainContext"
import {
  createSteps,
  modeOptions,
  type CreateStep,
  type DraftLaunch
} from "../../app/launchpad/pageModel"
import styles from "../Launchpad.module.css"

type StepStatus = {
  done: boolean
  hint: string
}

type CreateStepStatusMap = Record<CreateStep, StepStatus>

type LaunchCreateFormProps = {
  activeCreateStep: CreateStep
  activeStepIsLast: boolean
  activeStepStatus: StepStatus
  createStepStatus: CreateStepStatusMap
  createSubmitting: boolean
  draft: DraftLaunch
  isCw20Only: boolean
  launchLockDaysError?: string
  riskAcknowledged: boolean
  riskConfirmationText: string
  symbolError?: string
  onCreateFullLaunch: () => Promise<void>
  onDraftFieldChange: (
    field: keyof DraftLaunch
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onResetDraft: () => void
  onRiskAcknowledgedChange: (checked: boolean) => void
  onSetActiveCreateStep: (step: CreateStep) => void
  onSetDraft: Dispatch<SetStateAction<DraftLaunch>>
}

const LaunchCreateForm = ({
  activeCreateStep,
  activeStepIsLast,
  activeStepStatus,
  createStepStatus,
  createSubmitting,
  draft,
  isCw20Only,
  launchLockDaysError,
  riskAcknowledged,
  riskConfirmationText,
  symbolError,
  onCreateFullLaunch,
  onDraftFieldChange,
  onResetDraft,
  onRiskAcknowledgedChange,
  onSetActiveCreateStep,
  onSetDraft
}: LaunchCreateFormProps) => {
  const { chain, chainKey } = useAppChain()
  const creationFeeLabel = getLaunchpadCreationFeeLabel(chainKey)
  const nativeSymbol = chain.displayDenom

  return (
  <form className={`card ${styles.formCard}`}>
    <div className={styles.formHeader}>
      <div>
        <h3>{activeCreateStep === "token" ? "Token details" : "Launch setup"}</h3>
      </div>
      <div className={styles.formHeaderActions}>
        <button className={styles.textButton} type="button" onClick={onResetDraft}>
          Reset
        </button>
      </div>
    </div>

    <div className={styles.createStepper}>
      {createSteps.map((step) => {
        const active = step.id === activeCreateStep
        const done = createStepStatus[step.id].done
        return (
          <button
            key={step.id}
            className={`${styles.createStepButton} ${
              active ? styles.createStepButtonActive : ""
            } ${done ? styles.createStepButtonDone : ""}`}
            type="button"
            onClick={() => onSetActiveCreateStep(step.id)}
          >
            <span>{step.eyebrow}</span>
            <strong>{step.label}</strong>
          </button>
        )
      })}
    </div>

    {!activeStepStatus.done ? (
      <div className={styles.stepHint}>{activeStepStatus.hint}</div>
    ) : null}

    {activeCreateStep === "token" ? (
      <div className={styles.formSection}>
        <div className={styles.sectionLabel}>Token metadata</div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              value={draft.name}
              onChange={onDraftFieldChange("name")}
              placeholder="Burrito Token"
            />
          </label>
          <label className={styles.field}>
            <span>Symbol</span>
            <input
              value={draft.symbol}
              onChange={(event) =>
                onSetDraft((current) => ({
                  ...current,
                  symbol: event.target.value.toUpperCase().replace(/[^A-Z-]/g, "")
                }))
              }
              placeholder="TACO"
              maxLength={12}
            />
            {symbolError ? (
              <small className={styles.fieldWarning}>{symbolError}</small>
            ) : null}
          </label>
          <label className={styles.field}>
            <span>Total supply</span>
            <input
              value={draft.supply}
              onChange={onDraftFieldChange("supply")}
              inputMode="decimal"
            />
          </label>
          <label className={`${styles.field} ${styles.fullField}`}>
            <span>Logo URL</span>
            <input
              value={draft.logoUrl}
              onChange={onDraftFieldChange("logoUrl")}
              placeholder="https://.../logo.png"
            />
          </label>
        </div>
        <div className={styles.noticeBox}>
          Fixed supply CW20. Decimals are fixed to 6 on {chain.name}.
        </div>
      </div>
    ) : null}

    {activeCreateStep === "launch" ? (
      <div className={styles.modeGrid}>
        {modeOptions.map((option) => (
          <button
            key={option.id}
            className={`${styles.modeCard} ${
              draft.mode === option.id ? styles.modeCardActive : ""
            }`}
            type="button"
            onClick={() =>
              onSetDraft((current) => ({ ...current, mode: option.id }))
            }
          >
            <span>{option.label}</span>
            <strong>{option.title}</strong>
          </button>
        ))}
      </div>
    ) : null}

    {activeCreateStep === "launch" && !isCw20Only ? (
      <div className={styles.formSection}>
        <div className={styles.sectionLabel}>Initial pool</div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Token supply for LP (%)</span>
            <input
              value={draft.tokenForPoolPercent}
              onChange={onDraftFieldChange("tokenForPoolPercent")}
              inputMode="decimal"
            />
          </label>
          <label className={styles.field}>
            <span>{nativeSymbol} liquidity</span>
            <input
              value={draft.luncLiquidity}
              onChange={onDraftFieldChange("luncLiquidity")}
              inputMode="decimal"
            />
          </label>
        </div>
      </div>
    ) : null}

    {activeCreateStep === "launch" && isCw20Only ? (
      <div className={styles.formSection}>
        <div className={styles.sectionLabel}>Liquidity skipped</div>
        <div className={styles.noticeBox}>
          CW20 only creates the token contract without a pool or Swap route.
          Website and description are optional.
        </div>
      </div>
    ) : null}

    {activeCreateStep === "launch" ? (
      <div className={styles.formSection}>
        <div className={styles.sectionLabel}>
          {isCw20Only ? "Confirmation" : "Safety and public info"}
        </div>
        {!isCw20Only ? (
          <>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>LP lock days</span>
                <input
                  value={draft.lockDays}
                  onChange={onDraftFieldChange("lockDays")}
                  inputMode="numeric"
                />
                {launchLockDaysError ? (
                  <small className={styles.fieldWarning}>
                    {launchLockDaysError}
                  </small>
                ) : null}
              </label>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Website</span>
                <input
                  value={draft.website}
                  onChange={onDraftFieldChange("website")}
                  placeholder="https://"
                />
              </label>
              <label className={styles.field}>
                <span>X</span>
                <input
                  value={draft.xProfile}
                  onChange={onDraftFieldChange("xProfile")}
                  placeholder="@project"
                />
              </label>
            </div>
            <label className={styles.field}>
              <span>Description</span>
              <textarea
                value={draft.description}
                onChange={onDraftFieldChange("description")}
                placeholder="Short public description shown before trading."
                rows={4}
              />
            </label>
          </>
        ) : null}
        <label className={styles.confirmBox}>
          <input
            type="checkbox"
            checked={riskAcknowledged}
            onChange={(event) => onRiskAcknowledgedChange(event.target.checked)}
          />
          <span>{riskConfirmationText}</span>
        </label>
        <div className={styles.feeNotice}>
          <span>Creation fee</span>
          <strong>{creationFeeLabel}</strong>
          <small>
            Charged once when the token contract is created. Network gas is
            separate.
          </small>
        </div>
      </div>
    ) : null}

    <div className={styles.stepActions}>
      <button
        className="uiButton uiButtonPrimary"
        type="button"
        disabled={
          createSubmitting ||
          !activeStepStatus.done ||
          (activeStepIsLast && !riskAcknowledged)
        }
        onClick={() => {
          if (!activeStepIsLast) {
            onSetActiveCreateStep("launch")
            return
          }
          void onCreateFullLaunch()
        }}
      >
        {createSubmitting
          ? "Broadcasting..."
          : activeStepIsLast
          ? isCw20Only
            ? "Create CW20"
            : "Create launch"
          : "Next"}
      </button>
    </div>
  </form>
  )
}

export default LaunchCreateForm
