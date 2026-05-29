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
import { autoCropTransparent, removeImageBackground } from '../lib/imageProcessing'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { StickerImage } from '../lib/types'

interface Preview {
  url: string
  blob: Blob
}

export function StickerLibrary() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [images, setImages] = useState<StickerImage[]>([])
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

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

  // Camera capture → in-browser background removal → preview, before upload.
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (!file) return
    setProcessing(true)
    try {
      const cutout = await removeImageBackground(file)
      // Crop away the transparent margin so the subject fills the sticker.
      const cropped = await autoCropTransparent(cutout)
      setPreview({ url: URL.createObjectURL(cropped), blob: cropped })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setProcessing(false)
    }
  }

  function closePreview() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  async function handleUseSticker() {
    if (!preview || !parent) return
    setBusy(true)
    try {
      const file = new File([preview.blob], 'photo-sticker.png', {
        type: 'image/png',
      })
      const image = await uploadStickerImage({
        file,
        householdId: parent.household_id,
        label: 'Photo sticker',
      })
      setImages((prev) => [image, ...prev])
      closePreview()
      toast.success('Sticker added.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void handlePhoto(event)}
        className="hidden"
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy || processing}
          onClick={() => cameraInputRef.current?.click()}
          className="rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {processing ? 'Removing background…' : 'Take photo'}
        </button>
        <button
          type="button"
          disabled={busy || processing}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[var(--radius-card)] border border-accent/40 bg-accent/5 px-4 py-3 font-medium text-accent-strong transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-60"
        >
          {busy ? 'Uploading…' : 'Upload images'}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Take a photo of a sticker (on a contrasting surface) and the background
        is removed automatically. Or upload PNG, JPG, or WebP.
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

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sticker"
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
            <h2 className="text-center text-lg font-semibold text-ink">
              Use this sticker?
            </h2>
            <p className="mt-1 text-center text-sm text-ink-muted">
              Background removed. Transparent areas show as a checkerboard.
            </p>
            <div className="checkerboard mx-auto mt-4 flex aspect-square w-48 items-center justify-center overflow-hidden rounded-xl border border-black/10">
              <img
                src={preview.url}
                alt="Sticker preview"
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleUseSticker()}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Use sticker'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  closePreview()
                  cameraInputRef.current?.click()
                }}
                className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-60"
              >
                Retake
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closePreview}
                className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </SetupShell>
  )
}
