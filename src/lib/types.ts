import type { Database } from './database.types'

type Tables = Database['public']['Tables']

export type Household = Tables['household']['Row']
export type Parent = Tables['parent']['Row']
export type Kid = Tables['kid']['Row']
export type Chore = Tables['chore']['Row']
export type StickerEvent = Tables['sticker_event']['Row']
export type StickerImage = Tables['sticker_image']['Row']
export type RewardTier = Tables['reward_tier']['Row']
export type BoardChapter = Tables['board_chapter']['Row']
export type RedemptionEvent = Tables['redemption_event']['Row']
