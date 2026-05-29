import { inputClass } from './styles'

interface Step4RewardProps {
  rewardName: string
  rewardThreshold: string
  onRewardNameChange: (value: string) => void
  onRewardThresholdChange: (value: string) => void
}

export function Step4Reward({
  rewardName,
  rewardThreshold,
  onRewardNameChange,
  onRewardThresholdChange,
}: Step4RewardProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted">
        Set one reward to start. Earn this many stickers to unlock it.
      </p>
      <label className="block text-sm font-medium text-ink" htmlFor="reward-name">
        Reward
      </label>
      <input
        id="reward-name"
        value={rewardName}
        onChange={(e) => onRewardNameChange(e.target.value)}
        placeholder="Big reward"
        className={`${inputClass} mb-4`}
      />
      <label className="block text-sm font-medium text-ink" htmlFor="reward-threshold">
        Stickers needed
      </label>
      <input
        id="reward-threshold"
        type="number"
        inputMode="numeric"
        min={1}
        value={rewardThreshold}
        onChange={(e) => onRewardThresholdChange(e.target.value)}
        placeholder="10"
        className={inputClass}
      />
    </div>
  )
}
