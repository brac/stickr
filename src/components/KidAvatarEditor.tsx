import { useRef, useState, type ChangeEvent } from 'react'
import { autoCropTransparent, removeImageBackground } from '../lib/imageProcessing'
import {
  removeKidAvatar,
  setKidAvatarEmoji,
  uploadKidAvatar,
} from '../lib/kidAvatars'
import { getErrorMessage } from '../lib/errors'
import { useToast } from './toast/useToast'
import { KidAvatar } from './KidAvatar'
import type { Kid } from '../lib/types'

// A small curated set — a full emoji keyboard would be overkill (YAGNI).
const EMOJI_CHOICES = [
  '🧒', '👦', '👧', '👶', '🐶', '🐱',
  '🦊', '🐰', '🐻', '🦁', '🐯', '🐸',
  '🦄', '🐢', '🐥', '⭐',
]

interface KidAvatarEditorProps {
  kid: Kid
  onClose: () => void
  // Patch the kid in the parent's state so this editor reflects changes live.
  onUpdated: (patch: Partial<Kid>) => void
}

interface Preview {
  url: string
  blob: Blob
}

export function KidAvatarEditor({ kid, onClose, onUpdated }: KidAvatarEditorProps) {
  const toast = useToast()
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Both the camera and the upload path get background removal + autocrop, for
  // the sticker-cutout look.
  async function processFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProcessing(true)
    try {
      const cutout = await removeImageBackground(file)
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

  async function usePhoto() {
    if (!preview) return
    setSaving(true)
    try {
      const file = new File([preview.blob], 'avatar.png', { type: 'image/png' })
      const path = await uploadKidAvatar({
        file,
        householdId: kid.household_id,
        kidId: kid.id,
      })
      onUpdated({ avatar_path: path })
      closePreview()
      toast.success('Photo updated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemovePhoto() {
    setSaving(true)
    try {
      await removeKidAvatar(kid)
      onUpdated({ avatar_path: null })
      toast.success('Photo removed.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function pickEmoji(emoji: string) {
    setSaving(true)
    try {
      await setKidAvatarEmoji(kid.id, emoji)
      onUpdated({ avatar_emoji: emoji })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const busy = processing || saving

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo for ${kid.name}`}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void processFile(e)}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void processFile(e)}
        className="hidden"
      />

      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="text-center text-lg font-semibold text-ink">
          {kid.name}&rsquo;s photo
        </h2>

        {preview ? (
          <>
            <p className="mt-1 text-center text-sm text-ink-muted">
              Background removed. This goes on {kid.name}&rsquo;s badge.
            </p>
            <div className="checkerboard mx-auto mt-4 flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border border-black/10">
              <img
                src={preview.url}
                alt="Avatar preview"
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void usePhoto()}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Use photo'}
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
          </>
        ) : (
          <>
            <div className="mt-4 flex justify-center">
              <KidAvatar kid={kid} size="lg" allowEmojiFallback />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {processing ? 'Removing…' : 'Take photo'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-[var(--radius-card)] border border-accent/40 bg-accent/5 px-4 py-3 font-medium text-accent-strong transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-60"
              >
                Upload photo
              </button>
            </div>

            {kid.avatar_path && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemovePhoto()}
                className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                Remove photo
              </button>
            )}

            <p className="mt-5 text-center text-xs text-ink-muted">
              No photo? Pick an emoji for the badge.
            </p>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              {EMOJI_CHOICES.map((emoji) => {
                const selected = !kid.avatar_path && kid.avatar_emoji === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickEmoji(emoji)}
                    aria-pressed={selected}
                    className={`flex aspect-square items-center justify-center rounded-lg text-xl transition-colors disabled:opacity-60 ${
                      selected ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-black/5'
                    }`}
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
