import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  STICKER_SIZE,
  boardHeight,
  computeStickerPosition,
  hashStringToSeed,
  type BoardLayout,
} from '../lib/stickerPlacement'
import { pickStickerArt } from '../lib/stickerCatalog'
import { jostle } from '../lib/juice'
import type { StickerEvent } from '../lib/types'
import { EmptyState } from './EmptyState'

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

  // The jostle anchor is the just-landed sticker: the highest render index whose
  // id is in newIds. Already-placed neighbours wobble around it (with falloff);
  // the anchor itself slams in and does not jostle. jostleNonce changes on each
  // award (it carries the anchor's id) so the per-Sticker effect re-fires.
  let jostleAnchorIndex: number | null = null
  let jostleNonce = ''
  if (newIds && newIds.size > 0) {
    for (let i = 0; i < events.length; i++) {
      if (newIds.has(events[i].id)) {
        jostleAnchorIndex = i
        jostleNonce = events[i].id
      }
    }
  }

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
            index={index}
            seedId={event.id}
            x={pos.x}
            y={pos.y}
            rotation={pos.rotation}
            artUrl={art}
            isNew={newIds?.has(event.id) ?? false}
            interactive={interactive}
            rowSize={layout.rowSize}
            jostleAnchorIndex={jostleAnchorIndex}
            jostleNonce={jostleNonce}
          />
        )
      })}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <EmptyState
            tone="plain"
            illustration={
              <div
                aria-hidden="true"
                className="h-16 w-16 -rotate-6 rounded-2xl border-2 border-dashed border-ink/25"
              />
            }
            title="The board is ready"
            body="Tap a chore below to award the first sticker."
          />
        </div>
      )}
    </div>
  )
}

interface StickerProps {
  index: number
  seedId: string
  x: number
  y: number
  rotation: number
  artUrl: string | null
  isNew: boolean
  interactive: boolean
  rowSize: number
  // The just-landed sticker's render index (or null when nothing is new), and a
  // nonce that changes each award so the neighbour-jostle effect re-fires.
  jostleAnchorIndex: number | null
  jostleNonce: string
}

// Falloff by Chebyshev ring distance from the just-landed anchor on the sticker
// grid: ring 1 -> full wobble, ring 2 -> half, ring 3 -> quarter, beyond -> none.
// Farther neighbours jostle less.
function jostleIntensity(index: number, anchorIndex: number, rowSize: number): number {
  const row = Math.floor(index / rowSize)
  const col = index % rowSize
  const anchorRow = Math.floor(anchorIndex / rowSize)
  const anchorCol = anchorIndex % rowSize
  const ring = Math.max(Math.abs(row - anchorRow), Math.abs(col - anchorCol))
  if (ring === 1) return 1
  if (ring === 2) return 0.5
  if (ring === 3) return 0.25
  return 0
}

function Sticker({
  index,
  seedId,
  x,
  y,
  rotation,
  artUrl,
  isNew,
  interactive,
  rowSize,
  jostleAnchorIndex,
  jostleNonce,
}: StickerProps) {
  // Capture the entrance once, at mount: a freshly awarded sticker drops in,
  // everything else gets the gentle pop. Frozen so a later prop change (e.g. the
  // parent clearing newIds) can't retrigger the animation.
  const [entrance] = useState(() => (isNew ? 'sticker-drop' : 'sticker-pop'))
  // Freeze the impact ring at mount like the entrance, so a later newIds clear
  // can't retrigger or yank it mid-animation.
  const [showRing] = useState(() => isNew)
  // Freeze the landing sparkles at mount, mirroring the ring: only a freshly
  // awarded sticker emits them, and a later newIds clear can't retrigger.
  const [showSparkles] = useState(() => isNew)
  // Inner wrapper for the non-interactive (parent award) path. jostle() transforms
  // this element, never the positioned div, so the sticker's placement is untouched.
  const jostleRef = useRef<HTMLSpanElement | null>(null)

  // Neighbour jostle with falloff. Re-fires whenever a sticker lands (jostleNonce
  // changes). The anchor and any just-new sticker slam in and must not jostle.
  useEffect(() => {
    if (jostleAnchorIndex == null) return
    if (index === jostleAnchorIndex) return
    if (isNew) return
    const intensity = jostleIntensity(index, jostleAnchorIndex, rowSize)
    if (intensity <= 0) return
    if (jostleRef.current) jostle(jostleRef.current, intensity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jostleNonce])

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
      {/* Sparkles render BEFORE the art so the art paints on top (sparkles behind). */}
      {showSparkles && <SparkleBurst seedId={seedId} />}
      {interactive ? (
        <InteractiveArt seedId={seedId}>{art}</InteractiveArt>
      ) : (
        <span ref={jostleRef} className="sticker-jostle-layer">
          {art}
        </span>
      )}
      {showRing && <span className="impact-ring" aria-hidden="true" />}
    </div>
  )
}

// How many sparkle dots a freshly awarded sticker flings outward.
const SPARKLE_COUNT = 6
// Outward fling distance range (px) for sparkle dots — flung well clear of the
// sticker so the burst reads at a glance.
const SPARKLE_MIN_DIST = 54
const SPARKLE_MAX_DIST = 102

// Landing sparkles: a few dots fling outward and fade behind the sticker art.
// Vectors are seeded from the event id (via hashStringToSeed) so the burst is
// deterministic per sticker. Each dot animates transform + opacity only.
function SparkleBurst({ seedId }: { seedId: string }) {
  const seed = hashStringToSeed(seedId)
  const dots = Array.from({ length: SPARKLE_COUNT }, (_, i) => {
    // Spread dots roughly evenly around the circle, with a seeded angular jitter.
    const baseAngle = (i / SPARKLE_COUNT) * Math.PI * 2
    const jitter = (((seed >> i) % 13) - 6) * 0.08 // ~ -0.48..+0.48 rad
    const angle = baseAngle + jitter
    const distSeed = (seed >> (i + 3)) % 17 // 0..16
    const dist = SPARKLE_MIN_DIST + (distSeed / 16) * (SPARKLE_MAX_DIST - SPARKLE_MIN_DIST)
    const dx = `${Math.round(Math.cos(angle) * dist)}px`
    const dy = `${Math.round(Math.sin(angle) * dist)}px`
    const style: CSSProperties & Record<'--dx' | '--dy', string> = {
      '--dx': dx,
      '--dy': dy,
    }
    return <span key={i} className="sparkle" style={style} />
  })
  return (
    <span className="sparkle-burst" aria-hidden="true">
      {dots}
    </span>
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
