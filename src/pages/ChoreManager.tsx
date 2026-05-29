import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SetupShell } from '../components/SetupShell'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { useMyParent } from '../hooks/useMyParent'
import {
  createChore,
  fetchAllChores,
  setChoreActive,
  updateChore,
} from '../lib/chores'
import { fetchStickerImages } from '../lib/stickerImages'
import { useStickerImageUrls } from '../hooks/useStickerImageUrls'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { Chore, StickerImage } from '../lib/types'

interface FormState {
  id: string | null
  name: string
  stickerValue: number
  stickerImageId: string | null
}

const VALUES = [1, 2, 3]

export function ChoreManager() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [chores, setChores] = useState<Chore[]>([])
  const [images, setImages] = useState<StickerImage[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  const householdId = parent?.household_id

  useEffect(() => {
    if (!householdId) return
    let active = true
    Promise.all([fetchAllChores(householdId), fetchStickerImages(householdId)])
      .then(([choreRows, imageRows]) => {
        if (!active) return
        setChores(choreRows)
        setImages(imageRows)
      })
      .catch((err) => {
        if (active) toast.error(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [householdId, toast])

  const imageUrls = useStickerImageUrls(images)

  async function reloadChores() {
    if (!householdId) return
    setChores(await fetchAllChores(householdId))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form || !householdId) return
    const isNew = form.id === null
    setSaving(true)
    try {
      const input = {
        name: form.name,
        stickerValue: form.stickerValue,
        stickerImageId: form.stickerImageId,
        sortOrder: isNew
          ? chores.reduce((max, c) => Math.max(max, c.sort_order), -1) + 1
          : (chores.find((c) => c.id === form.id)?.sort_order ?? 0),
      }
      if (isNew) {
        await createChore(householdId, input)
      } else {
        await updateChore(form.id as string, input)
      }
      await reloadChores()
      setForm(null)
      toast.success(isNew ? 'Chore added.' : 'Chore updated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(chore: Chore) {
    try {
      await setChoreActive(chore.id, !chore.active)
      await reloadChores()
      toast.success(chore.active ? 'Chore deactivated.' : 'Chore activated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (loading) {
    return <FullScreenSpinner />
  }

  return (
    <SetupShell title="Chores" backTo="/setup">
      {form ? (
        <ChoreForm
          form={form}
          images={images}
          imageUrls={imageUrls}
          saving={saving}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => setForm(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() =>
            setForm({ id: null, name: '', stickerValue: 1, stickerImageId: null })
          }
          className="w-full rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Add a chore
        </button>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {chores.map((chore) => {
          const url = chore.sticker_image_id
            ? imageUrls[chore.sticker_image_id]
            : undefined
          return (
            <li
              key={chore.id}
              className="flex items-center gap-3 rounded-xl border border-black/10 bg-surface-raised p-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/5">
                {url ? (
                  <img src={url} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <span className="text-lg" aria-hidden="true">
                    ⭐
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {chore.name}
                </span>
                <span className="text-sm text-ink-muted">
                  +{chore.sticker_value}
                  {!chore.active && ' · inactive'}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    id: chore.id,
                    name: chore.name,
                    stickerValue: chore.sticker_value,
                    stickerImageId: chore.sticker_image_id,
                  })
                }
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleToggleActive(chore)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
              >
                {chore.active ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          )
        })}
        {chores.length === 0 && (
          <p className="mt-6 text-center text-sm text-ink-muted">
            No chores yet. Add your first one above.
          </p>
        )}
      </ul>
    </SetupShell>
  )
}

interface ChoreFormProps {
  form: FormState
  images: StickerImage[]
  imageUrls: Record<string, string>
  saving: boolean
  onChange: (form: FormState) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

function ChoreForm({
  form,
  images,
  imageUrls,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: ChoreFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4"
    >
      <label className="block text-sm font-medium text-ink" htmlFor="chore-name">
        Name
      </label>
      <input
        id="chore-name"
        required
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        placeholder="Brushed teeth"
        className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      <p className="mt-4 text-sm font-medium text-ink">Stickers per tap</p>
      <div className="mt-1 flex gap-2">
        {VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange({ ...form, stickerValue: value })}
            className={`flex-1 rounded-lg border-2 py-2 font-medium transition-colors ${
              form.stickerValue === value
                ? 'border-accent bg-accent/10 text-ink'
                : 'border-black/10 text-ink-muted hover:border-accent/40'
            }`}
          >
            +{value}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm font-medium text-ink">Sticker</p>
      {images.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">
          No images yet — uses the default star.{' '}
          <Link to="/setup/stickers" className="text-accent-strong underline">
            Add images
          </Link>
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, stickerImageId: null })}
            className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 text-lg transition-colors ${
              form.stickerImageId === null
                ? 'border-accent bg-accent/10'
                : 'border-black/10 hover:border-accent/40'
            }`}
            aria-label="Default star"
          >
            ⭐
          </button>
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onChange({ ...form, stickerImageId: image.id })}
              className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 p-1 transition-colors ${
                form.stickerImageId === image.id
                  ? 'border-accent bg-accent/10'
                  : 'border-black/10 hover:border-accent/40'
              }`}
            >
              <img
                src={imageUrls[image.id]}
                alt={image.label ?? 'Sticker'}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {saving ? 'Saving…' : form.id === null ? 'Add chore' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
