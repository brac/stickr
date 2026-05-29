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
import { makeStickerCutout, type StickerTreatment } from '../lib/imageProcessing'
import { getErrorMessage } from '../lib/errors'
import { prefersWebcamCapture } from '../lib/webcam'
import { WebcamCapture } from '../components/WebcamCapture'
import { useToast } from '../components/toast/useToast'
import type { StickerImage } from '../lib/types'

interface Preview {
  url: string
  blob: Blob
  treatment: StickerTreatment
}

export function StickerLibrary() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [images, setImages] = useState<StickerImage[]>([])
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [showWebcam, setShowWebcam] = useState(false)
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
    // Uploaded photos get the same cutout + die-cut border as the camera path,
    // so every sticker shares one look. Background removal is slow, so this
    // reuses the "processing" state to disable the controls while it runs.
    setProcessing(true)
    try {
      let count = 0
      let fellBack = 0
      for (const file of Array.from(files)) {
        const label = file.name.replace(/\.[^.]+$/, '')
        const { blob, treatment } = await makeStickerCutout(file)
        if (treatment === 'fallback') fellBack++
        const processed = new File([blob], `${label}.png`, { type: 'image/png' })
        const image = await uploadStickerImage({
          file: processed,
          householdId: parent.household_id,
          label,
        })
        setImages((prev) => [image, ...prev])
        count++
      }
      if (count > 0) {
        toast.success(`${count} image${count === 1 ? '' : 's'} uploaded.`)
        if (fellBack > 0) {
          toast.info(
            `Couldn't remove the background on ${fellBack} ${
              fellBack === 1 ? 'image' : 'images'
            } — used the full photo.`,
          )
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Take photo → in-browser background removal → preview, before upload. The
  // source is the desktop webcam or the mobile native camera, both funnelled
  // through here as a File.
  async function processPhoto(file: File) {
    setProcessing(true)
    try {
      const { blob, treatment } = await makeStickerCutout(file)
      setPreview({ url: URL.createObjectURL(blob), blob, treatment })
      if (treatment === 'fallback') {
        toast.info(
          "Couldn't remove the background on this device — using the full photo.",
        )
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setProcessing(false)
    }
  }

  // "Take photo": drive the webcam directly on desktop (where the file input's
  // capture attribute is ignored), else open the device camera via the input.
  function startPhotoCapture() {
    if (prefersWebcamCapture()) {
      setShowWebcam(true)
    } else {
      cameraInputRef.current?.click()
    }
  }

  function onCameraInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (file) void processPhoto(file)
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
        onChange={onCameraInput}
        className="hidden"
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy || processing}
          onClick={startPhotoCapture}
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
          {processing ? 'Processing…' : busy ? 'Uploading…' : 'Upload images'}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Take a photo or upload one (PNG, JPG, or WebP) — the background is
        removed and a die-cut border added automatically.
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
              {preview.treatment === 'cutout'
                ? 'Background removed with a die-cut border. Transparent areas show as a checkerboard.'
                : preview.treatment === 'passthrough'
                  ? 'Already transparent — using your image as-is.'
                  : "Couldn't remove the background on this device — using the full photo."}
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
                  startPhotoCapture()
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

      {showWebcam && (
        <WebcamCapture
          onCapture={(file) => {
            setShowWebcam(false)
            void processPhoto(file)
          }}
          onClose={() => setShowWebcam(false)}
        />
      )}
    </SetupShell>
  )
}
