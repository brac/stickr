import type { CSSProperties } from 'react'
import {
  STICKER_SIZE,
  boardHeight,
  computeStickerPosition,
  hashStringToSeed,
  type BoardLayout,
} from '../lib/stickerPlacement'
import { pickStickerArt } from '../lib/stickerCatalog'
import type { StickerEvent } from '../lib/types'

// Fallback colors only used if the sticker catalog ever becomes empty
// (all files deleted from src/assets/stickers/).
const FALLBACK_COLORS = [
  '#f4b942',
  '#ef6f6c',
  '#2fa8a3',
  '#9b6bdc',
  '#e98074',
  '#3a89c9',
]

interface StickerBoardProps {
  events: StickerEvent[]
  layout: BoardLayout
  // sticker_image_id -> public image URL, for events with assigned artwork.
  imageUrls: Record<string, string>
}

export function StickerBoard({ events, layout, imageUrls }: StickerBoardProps) {
  const height = boardHeight(events.length || 1, layout.rowSize)
  return (
    <div
      className="corkboard relative w-full overflow-hidden"
      style={{ height }}
    >
      {events.map((event, index) => {
        const pos = computeStickerPosition(event.id, index, layout)
        const assigned = event.sticker_image_id
          ? imageUrls[event.sticker_image_id]
          : undefined
        const art = assigned ?? pickStickerArt(event.id)
        return (
          <Sticker
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
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink/70">
          Tap a chore below to award the first sticker.
        </p>
      )}
    </div>
  )
}

interface StickerProps {
  seedId: string
  x: number
  y: number
  rotation: number
  artUrl: string | null
}

function Sticker({ seedId, x, y, rotation, artUrl }: StickerProps) {
  const style: CSSProperties & Record<'--x' | '--y' | '--rot', string> = {
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    '--x': `${x}px`,
    '--y': `${y}px`,
    '--rot': `${rotation}deg`,
  }
  return (
    <div className="sticker-pop absolute top-0 left-0" style={style}>
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
