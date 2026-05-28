import { useEffect, useState } from 'react'
import type { StickerImage } from '../lib/types'
import { pickStickerArt } from '../lib/stickerCatalog'

export interface CustomAwardInput {
  label: string
  value: number
  stickerImageId: string | null
}

interface CustomAwardModalProps {
  stickerImages: StickerImage[]
  // sticker_image_id -> public URL
  imageUrls: Record<string, string>
  onAward: (input: CustomAwardInput) => Promise<void>
  onClose: () => void
}

const VALUES = [1, 2, 3]

export function CustomAwardModal({
  stickerImages,
  imageUrls,
  onAward,
  onClose,
}: CustomAwardModalProps) {
  const [label, setLabel] = useState('')
  const [value, setValue] = useState(1)
  const [stickerImageId, setStickerImageId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const trimmed = label.trim()
  const canSubmit = trimmed.length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onAward({ label: trimmed, value, stickerImageId })
    } finally {
      setSubmitting(false)
    }
  }

  // Default art preview keyed on the typed name, so it stays stable as you type.
  const defaultArt = pickStickerArt(trimmed || 'custom')

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Award a custom sticker"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-surface px-5 pb-10 pt-5 shadow-2xl"
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/20"
          aria-hidden="true"
        />

        <h2 className="text-center text-lg font-semibold text-ink">
          Custom sticker
        </h2>

        <label className="mt-5 block text-sm font-medium text-ink">
          What for?
          <input
            type="text"
            value={label}
            autoFocus
            maxLength={40}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Helped with dishes"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-surface-raised px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Stickers</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {VALUES.map((option) => {
              const isSelected = value === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setValue(option)}
                  className={[
                    'rounded-xl border-2 py-2.5 text-center font-semibold transition-colors',
                    isSelected
                      ? 'border-accent bg-accent/10 text-ink'
                      : 'border-black/10 bg-black/5 text-ink-muted hover:border-accent/50',
                  ].join(' ')}
                >
                  +{option}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Sticker</legend>
          <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-6">
            <StickerChoice
              selected={stickerImageId === null}
              onSelect={() => setStickerImageId(null)}
              artUrl={defaultArt}
              alt="Default sticker"
            />
            {stickerImages.map((image) => (
              <StickerChoice
                key={image.id}
                selected={stickerImageId === image.id}
                onSelect={() => setStickerImageId(image.id)}
                artUrl={imageUrls[image.id] ?? null}
                alt={image.label ?? 'Sticker'}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="mt-6 w-full rounded-xl bg-accent py-4 font-semibold text-white transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {submitting
            ? 'Awarding…'
            : `Award ${value} ${value === 1 ? 'sticker' : 'stickers'}`}
        </button>
      </div>
    </>
  )
}

interface StickerChoiceProps {
  selected: boolean
  onSelect: () => void
  artUrl: string | null
  alt: string
}

function StickerChoice({ selected, onSelect, artUrl, alt }: StickerChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex aspect-square items-center justify-center rounded-xl border-2 p-1.5 transition-colors',
        selected
          ? 'border-accent bg-accent/10'
          : 'border-black/10 bg-surface-raised hover:border-accent/50',
      ].join(' ')}
    >
      {artUrl && (
        <img
          src={artUrl}
          alt={alt}
          className="h-full w-full object-contain"
          draggable={false}
        />
      )}
    </button>
  )
}
