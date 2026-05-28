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
import { useToast } from '../components/toast/useToast'
import type { StickerImage } from '../lib/types'

export function StickerLibrary() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [images, setImages] = useState<StickerImage[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!parent) return
    let active = true
    fetchStickerImages(parent.household_id)
      .then((rows) => {
        if (active) setImages(rows)
      })
      .catch((err) => {
        if (active) toast.error(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [parent, toast])

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || !parent) return
    setBusy(true)
    try {
      let count = 0
      for (const file of Array.from(files)) {
        const image = await uploadStickerImage({
          file,
          householdId: parent.household_id,
          label: file.name.replace(/\.[^.]+$/, ''),
        })
        setImages((prev) => [image, ...prev])
        count++
      }
      if (count > 0) {
        toast.success(`${count} image${count === 1 ? '' : 's'} uploaded.`)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(image: StickerImage) {
    if (!window.confirm('Delete this sticker image?')) return
    try {
      await deleteStickerImage(image)
      setImages((prev) => prev.filter((i) => i.id !== image.id))
      toast.success('Sticker image deleted.')
    } catch (err) {
      toast.error(getErrorMessage(err))
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
