import type { Database } from './database.types'

type Tables = Database['public']['Tables']

export type Household = Tables['household']['Row']
export type Parent = Tables['parent']['Row']
export type Kid = Tables['kid']['Row']
export type Chore = Tables['chore']['Row']
export type StickerEvent = Tables['sticker_event']['Row']
