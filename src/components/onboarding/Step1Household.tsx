import { inputClass } from './styles'

interface Step1HouseholdProps {
  householdName: string
  parentName: string
  onHouseholdNameChange: (value: string) => void
  onParentNameChange: (value: string) => void
}

export function Step1Household({
  householdName,
  parentName,
  onHouseholdNameChange,
  onParentNameChange,
}: Step1HouseholdProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor="household">
        Household name
      </label>
      <input
        id="household"
        value={householdName}
        onChange={(e) => onHouseholdNameChange(e.target.value)}
        placeholder="The Smiths"
        className={`${inputClass} mb-4`}
      />
      <label className="block text-sm font-medium text-ink" htmlFor="parent">
        Your name
      </label>
      <input
        id="parent"
        value={parentName}
        onChange={(e) => onParentNameChange(e.target.value)}
        placeholder="Mom"
        className={inputClass}
      />
    </div>
  )
}
