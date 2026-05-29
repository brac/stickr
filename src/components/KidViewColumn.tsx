import { useCallback, useEffect, useRef } from 'react'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { useKidBoard } from '../hooks/useKidBoard'
import { StickerBoard } from './StickerBoard'
import { ProgressBar } from './ProgressBar'
import type { Kid, Parent, RewardTier } from '../lib/types'

interface KidViewColumnProps {
  kid: Kid
  parent: Parent | null
  rewardTiers: RewardTier[]
  imageUrls: Record<string, string>
}

// One kid's board in the kid-facing view: big name, a live sticker count,
// interactive (springy) stickers, and the progress bar — no awarding or admin
// controls. Reuses useKidBoard purely for its realtime sync, so a sticker a
// parent awards on another device appears here within a couple of seconds.
export function KidViewColumn({
  kid,
  parent,
  rewardTiers,
  imageUrls,
}: KidViewColumnProps) {
  const { ref: boardRef, layout } = useBoardLayout()

  // Read layout lazily so resizes don't churn the board hook (mirrors KidColumn).
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const getLayout = useCallback(() => layoutRef.current, [])

  const board = useKidBoard(kid, { parent, getLayout })

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <h2 className="text-center text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        {board.kid.name}
      </h2>
      <p className="mt-1 text-center text-xl font-semibold text-accent-strong">
        {board.total} {board.total === 1 ? 'sticker' : 'stickers'}
      </p>

      <div ref={boardRef} className="mt-4 w-full">
        <StickerBoard
          events={board.events}
          layout={layout}
          imageUrls={imageUrls}
          newIds={board.newIds}
          interactive
        />
      </div>

      <ProgressBar total={board.total} tiers={rewardTiers} />
    </section>
  )
}
