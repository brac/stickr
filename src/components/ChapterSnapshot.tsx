import type { CSSProperties } from 'react'
import { useBoardLayout } from '../hooks/useBoardLayout'
import {
  STICKER_SIZE,
  boardHeight,
  computeStickerPosition,
  hashStringToSeed,
} from '../lib/stickerPlacement'
import { pickStickerArt } from '../lib/stickerCatalog'
import type { StickerEvent } from '../lib/types'

const FALLBACK_COLORS = [
  '#f4b942', '#ef6f6c', '#2fa8a3', '#9b6bdc', '#e98074', '#3a89c9',
]

interface ChapterSnapshotProps {
  events: StickerEvent[]
  imageUrls?: Record<string, string>
}

export function ChapterSnapshot({ events, imageUrls = {} }: ChapterSnapshotProps) {
  const { ref, layout } = useBoardLayout()
  const height = boardHeight(Math.max(events.length, 1), layout.rowSize)

  return (
    <div
      ref={ref}
      className="corkboard relative w-full overflow-hidden"
      style={{ height }}
      aria-hidden="true"
    >
      {events.map((event, index) => {
        const pos = computeStickerPosition(event.id, index, layout)
        const assigned = event.sticker_image_id ? imageUrls[event.sticker_image_id] : undefined
        const art = assigned ?? pickStickerArt(event.id)
        return (
          <SnapshotSticker
            key={event.id}
            seedId={event.id}
            x={pos.x}
            y={pos.y}
            rotation={pos.rotation}
            artUrl={art}
          />
        )
      })}
      {events.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-ink/50">
          No stickers
        </p>
      )}
    </div>
  )
}

interface SnapshotStickerProps {
  seedId: string
  x: number
  y: number
  rotation: number
  artUrl: string | null
}

// Static variant — no pop animation, no will-change.
function SnapshotSticker({ seedId, x, y, rotation, artUrl }: SnapshotStickerProps) {
  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))',
  }
  return (
    <div style={style}>
      {artUrl ? (
        <img
          src={artUrl}
          alt=""
          width={STICKER_SIZE}
          height={STICKER_SIZE}
          draggable={false}
          className="h-full w-full object-contain"
        />
      ) : (
        <FallbackStar seedId={seedId} />
      )}
    </div>
  )
}

function FallbackStar({ seedId }: { seedId: string }) {
  const color = FALLBACK_COLORS[hashStringToSeed(seedId) % FALLBACK_COLORS.length]
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path
        d="M32 4 L39.6 24.8 L61.6 25.6 L43.8 38.6 L50.4 60 L32 47.2 L13.6 60 L20.2 38.6 L2.4 25.6 L24.4 24.8 Z"
        fill={color}
        stroke="white"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
