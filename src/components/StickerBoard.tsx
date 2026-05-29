import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  // Event ids awarded just now — these drop in with extra flourish. The parent
  // may clear ids after the animation; each Sticker captures its entrance at
  // mount, so clearing never restarts an already-played animation.
  newIds?: ReadonlySet<string>
  // Kid-facing board: stickers spring up on hover/tap. Read-only — no clicks.
  // The parent board and history snapshots omit this (behaviour unchanged).
  interactive?: boolean
}

// How long the board holds its kick nudge — comfortably past the ~280ms animation.
const BOARD_KICK_MS = 300

export function StickerBoard({
  events,
  layout,
  imageUrls,
  newIds,
  interactive = false,
}: StickerBoardProps) {
  const height = boardHeight(events.length || 1, layout.rowSize)

  // Kick the board when a new sticker lands. A mount guard skips the initial
  // 0 -> N population (and history snapshots, which mount once); only a later
  // increase in events.length kicks. The CSS class is neutralised under
  // prefers-reduced-motion, so this stays reduced-motion safe.
  const prevLenRef = useRef(events.length)
  const [kicking, setKicking] = useState(false)
  useEffect(() => {
    const prevLen = prevLenRef.current
    prevLenRef.current = events.length
    if (events.length <= prevLen) return
    setKicking(true)
    const timeout = window.setTimeout(() => setKicking(false), BOARD_KICK_MS)
    return () => window.clearTimeout(timeout)
  }, [events.length])

  return (
    <div
      className={`corkboard relative w-full overflow-hidden${kicking ? ' board-kick' : ''}`}
      style={{ height }}
      data-testid="sticker-board"
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
            isNew={newIds?.has(event.id) ?? false}
            interactive={interactive}
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
  isNew: boolean
  interactive: boolean
}

function Sticker({ seedId, x, y, rotation, artUrl, isNew, interactive }: StickerProps) {
  // Capture the entrance once, at mount: a freshly awarded sticker drops in,
  // everything else gets the gentle pop. Frozen so a later prop change (e.g. the
  // parent clearing newIds) can't retrigger the animation.
  const [entrance] = useState(() => (isNew ? 'sticker-drop' : 'sticker-pop'))
  // Freeze the impact ring at mount like the entrance, so a later newIds clear
  // can't retrigger or yank it mid-animation.
  const [showRing] = useState(() => isNew)
  const style: CSSProperties & Record<'--x' | '--y' | '--rot', string> = {
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    '--x': `${x}px`,
    '--y': `${y}px`,
    '--rot': `${rotation}deg`,
  }
  const art = artUrl ? (
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
  )
  return (
    <div
      className={`${entrance} absolute top-0 left-0`}
      style={style}
      data-testid="sticker"
    >
      {interactive ? <InteractiveArt seedId={seedId}>{art}</InteractiveArt> : art}
      {showRing && <span className="impact-ring" aria-hidden="true" />}
    </div>
  )
}

// Wraps the sticker art so it springs up on hover/tap, with a small seeded
// rotation so each one wobbles a touch differently. Scaling here (not on the
// positioned parent) keeps the entrance animation's transform untouched.
function InteractiveArt({
  seedId,
  children,
}: {
  seedId: string
  children: ReactNode
}) {
  const hoverRot = (hashStringToSeed(seedId) % 17) - 8 // -8°..+8°
  const style: CSSProperties & Record<'--hover-rot', string> = {
    '--hover-rot': `${hoverRot}deg`,
  }
  return (
    <span className="sticker-interactive" style={style}>
      {children}
    </span>
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
