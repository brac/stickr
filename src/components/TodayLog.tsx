import { pickStickerArt } from '../lib/stickerCatalog'
import type { StickerEvent } from '../lib/types'

interface TodayLogProps {
  events: StickerEvent[]
  // chore_id -> chore name, for naming chore awards.
  choreNames: Record<string, string>
  // sticker_image_id -> public URL, for thumbnails.
  imageUrls: Record<string, string>
}

const MAX_ITEMS = 8

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function isToday(iso: string): boolean {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

// A compact strip of today's most recent awards. Derived from the current
// chapter's events, so it stays in sync with optimistic and realtime updates
// without a separate query. Renders nothing until the first sticker of the day.
export function TodayLog({ events, choreNames, imageUrls }: TodayLogProps) {
  const today = events
    .filter((event) => isToday(event.created_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ITEMS)

  if (today.length === 0) return null

  return (
    <section className="mt-6" aria-label="Today's stickers">
      <h2 className="text-sm font-medium text-ink-muted">Today</h2>
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {today.map((event) => {
          const name =
            (event.chore_id ? choreNames[event.chore_id] : undefined) ??
            event.label ??
            'Sticker'
          const art =
            (event.sticker_image_id
              ? imageUrls[event.sticker_image_id]
              : undefined) ?? pickStickerArt(event.id)
          return (
            <li
              key={event.id}
              className="flex shrink-0 items-center gap-2 rounded-full border border-black/10 bg-surface-raised py-1.5 pr-3 pl-1.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5">
                {art && (
                  <img
                    src={art}
                    alt=""
                    className="h-5 w-5 object-contain"
                    draggable={false}
                  />
                )}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-ink">{name}</span>
                <span className="text-xs text-ink-muted">
                  {timeFormat.format(new Date(event.created_at))}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
