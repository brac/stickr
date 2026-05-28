import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { SetupShell } from '../components/SetupShell'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { useMyParent } from '../hooks/useMyParent'
import {
  deleteStickerImage,
  fetchStickerImages,
  stickerImageUrl,
  uploadStickerImage,
} from '../lib/stickerImages'
import { getErrorMessage } from '../lib/errors'
import type { StickerImage } from '../lib/types'

export function StickerLibrary() {
  const { parent, loading } = useMyParent()
  const [images, setImages] = useState<StickerImage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!parent) return
    let active = true
    fetchStickerImages(parent.household_id)
      .then((rows) => {
        if (active) setImages(rows)
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [parent])

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || !parent) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const image = await uploadStickerImage({
          file,
          householdId: parent.household_id,
          label: file.name.replace(/\.[^.]+$/, ''),
        })
        setImages((prev) => [image, ...prev])
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(image: StickerImage) {
    if (!window.confirm('Delete this sticker image?')) return
    setError(null)
    try {
      await deleteStickerImage(image)
      setImages((prev) => prev.filter((i) => i.id !== image.id))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (loading) {
    return <FullScreenSpinner />
  }

  return (
    <SetupShell title="Sticker library" backTo="/setup">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => void handleFiles(event)}
        className="hidden"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? 'Uploading…' : 'Upload images'}
      </button>
      <p className="mt-2 text-center text-xs text-ink-muted">
        PNG, JPG, or WebP. Resized to 256px and stored for this household.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-muted">
          No sticker images yet. Upload a few to use on your chores.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <li
              key={image.id}
              className="group relative aspect-square rounded-xl border border-black/10 bg-surface-raised p-2"
            >
              <img
                src={stickerImageUrl(image.storage_path)}
                alt={image.label ?? 'Sticker'}
                className="h-full w-full object-contain"
                draggable={false}
              />
              <button
                type="button"
                aria-label="Delete sticker"
                onClick={() => void handleDelete(image)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </SetupShell>
  )
}
