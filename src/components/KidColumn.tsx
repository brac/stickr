import { useCallback, useEffect, useRef, useState } from 'react'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { useKidBoard, type AwardParams } from '../hooks/useKidBoard'
import { StickerBoard } from './StickerBoard'
import { ProgressBar } from './ProgressBar'
import { RedemptionSheet } from './RedemptionSheet'
import { TodayLog } from './TodayLog'
import type { Kid, Parent, RewardTier } from '../lib/types'

// The slice of a kid board Home needs to drive from its shared chrome (the
// chore grid awards the selected kid; the menu's undo/reset target it too).
export interface KidColumnApi {
  award: (params: AwardParams) => Promise<void>
  undoLast: () => Promise<void>
  resetBoard: () => Promise<void>
  total: number
}

interface KidColumnProps {
  kid: Kid
  parent: Parent | null
  rewardTiers: RewardTier[]
  imageUrls: Record<string, string>
  // chore_id -> name, for the Today strip.
  choreNames: Record<string, string>
  // Publish this column's award/undo/reset/total up to Home so the shared chore
  // grid and board menu can act on the selected kid.
  onApi: (kidId: string, api: KidColumnApi) => void
}

export function KidColumn({
  kid,
  parent,
  rewardTiers,
  imageUrls,
  choreNames,
  onApi,
}: KidColumnProps) {
  const { ref: boardRef, layout } = useBoardLayout()

  // Read layout lazily in award placement so resizes don't churn the hook.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const getLayout = useCallback(() => layoutRef.current, [])

  const board = useKidBoard(kid, { parent, getLayout })
  const [showRedemption, setShowRedemption] = useState(false)

  const { award, undoLast, resetBoard, total } = board
  useEffect(() => {
    onApi(kid.id, { award, undoLast, resetBoard, total })
  }, [kid.id, onApi, award, undoLast, resetBoard, total])

  return (
    <section className="min-w-0 flex-1">
      <p className="text-center text-sm uppercase tracking-[0.2em] text-ink-muted">
        {board.kid.name}'s board
      </p>
      <div ref={boardRef} className="mt-3 w-full">
        <StickerBoard
          events={board.events}
          layout={layout}
          imageUrls={imageUrls}
          newIds={board.newIds}
        />
      </div>
      <ProgressBar
        total={board.total}
        tiers={rewardTiers}
        onClaimClick={() => setShowRedemption(true)}
      />

      <TodayLog
        events={board.events}
        choreNames={choreNames}
        imageUrls={imageUrls}
      />

      {showRedemption && (
        <RedemptionSheet
          tiers={rewardTiers}
          total={board.total}
          onRedeem={async (tier) => {
            await board.redeem(tier)
            setShowRedemption(false)
          }}
          onClose={() => setShowRedemption(false)}
        />
      )}
    </section>
  )
}
