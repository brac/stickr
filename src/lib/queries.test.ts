import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock, rpcMock, getSessionMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getSessionMock: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    auth: { getSession: getSessionMock },
  },
}))

import {
  newStickerToEvent,
  awardStickers,
  fetchMyParent,
  fetchHousehold,
  fetchKid,
  fetchChapterEvents,
  fetchPastChapters,
  fetchRewardTiers,
  removeStickerEvent,
  clearChapterStickers,
  redeemChapter,
  createHousehold,
  joinHousehold,
  type NewSticker,
} from './queries'

function makeSticker(overrides: Partial<NewSticker> = {}): NewSticker {
  return {
    id: 'evt-1',
    kidId: 'kid-1',
    choreId: 'chore-1',
    chapterId: 'chap-1',
    parentId: 'parent-1',
    stickerImageId: 'img-1',
    label: null,
    createdAt: '2026-05-28T12:00:00.000Z',
    position: { x: 10, y: 20, rotation: -5 },
    ...overrides,
  }
}

describe('newStickerToEvent', () => {
  it('maps camelCase award fields onto the snake_case event row', () => {
    expect(newStickerToEvent(makeSticker())).toEqual({
      id: 'evt-1',
      kid_id: 'kid-1',
      chore_id: 'chore-1',
      chapter_id: 'chap-1',
      sticker_image_id: 'img-1',
      awarded_by: 'parent-1',
      amount: 1,
      label: null,
      position_x: 10,
      position_y: 20,
      rotation: -5,
      created_at: '2026-05-28T12:00:00.000Z',
    })
  })

  it('always sets amount to 1 (one event = one sticker)', () => {
    expect(newStickerToEvent(makeSticker()).amount).toBe(1)
  })

  it('carries a custom-award label through and leaves chore_id null', () => {
    const event = newStickerToEvent(
      makeSticker({ choreId: null, label: 'Extra hug' }),
    )
    expect(event.chore_id).toBeNull()
    expect(event.label).toBe('Extra hug')
  })
})

describe('awardStickers', () => {
  beforeEach(() => fromMock.mockReset())

  it('short-circuits without hitting the DB for an empty list', async () => {
    await awardStickers([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('inserts one row per sticker with amount 1', async () => {
    const builder = queryResult({ error: null })
    fromMock.mockReturnValue(builder)

    await awardStickers([makeSticker({ id: 'a' }), makeSticker({ id: 'b' })])

    expect(fromMock).toHaveBeenCalledWith('sticker_event')
    const rows = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'a', amount: 1, position_x: 10 })
  })

  it('throws when the insert fails', async () => {
    const error = new Error('insert failed')
    fromMock.mockReturnValue(queryResult({ error }))
    await expect(awardStickers([makeSticker()])).rejects.toBe(error)
  })
})

describe('fetchMyParent', () => {
  beforeEach(() => {
    fromMock.mockReset()
    getSessionMock.mockReset()
  })

  it('returns null when there is no signed-in user', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    await expect(fetchMyParent()).resolves.toBeNull()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('looks up the parent row for the signed-in user', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'auth-9' } } },
    })
    const builder = queryResult({ data: { id: 'parent-9' }, error: null })
    fromMock.mockReturnValue(builder)

    await expect(fetchMyParent()).resolves.toEqual({ id: 'parent-9' })
    expect(builder.eq).toHaveBeenCalledWith('auth_user_id', 'auth-9')
  })
})

describe('fetchPastChapters', () => {
  beforeEach(() => fromMock.mockReset())

  it('flattens a redemption_event array + reward_tier object into reward_name', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [
          {
            id: 'ch-1',
            kid_id: 'kid-1',
            started_at: 's1',
            ended_at: 'e1',
            redemption_event: [{ reward_tier: { name: 'Ice cream' } }],
          },
        ],
        error: null,
      }),
    )
    const [chapter] = await fetchPastChapters('kid-1')
    expect(chapter.reward_name).toBe('Ice cream')
  })

  it('flattens a redemption_event object + reward_tier array', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [
          {
            id: 'ch-2',
            kid_id: 'kid-1',
            started_at: 's2',
            ended_at: 'e2',
            redemption_event: { reward_tier: [{ name: 'Toy' }] },
          },
        ],
        error: null,
      }),
    )
    const [chapter] = await fetchPastChapters('kid-1')
    expect(chapter.reward_name).toBe('Toy')
  })

  it('yields a null reward_name when there is no redemption', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [
          {
            id: 'ch-3',
            kid_id: 'kid-1',
            started_at: 's3',
            ended_at: 'e3',
            redemption_event: null,
          },
        ],
        error: null,
      }),
    )
    const [chapter] = await fetchPastChapters('kid-1')
    expect(chapter.reward_name).toBeNull()
  })

  it('returns an empty array when there are no chapters', async () => {
    fromMock.mockReturnValue(queryResult({ data: null, error: null }))
    await expect(fetchPastChapters('kid-1')).resolves.toEqual([])
  })
})

describe('single-row fetchers', () => {
  beforeEach(() => fromMock.mockReset())

  it('fetchHousehold returns the row', async () => {
    fromMock.mockReturnValue(queryResult({ data: { id: 'hh-1' }, error: null }))
    await expect(fetchHousehold('hh-1')).resolves.toEqual({ id: 'hh-1' })
  })

  it('fetchHousehold throws on error', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(queryResult({ data: null, error }))
    await expect(fetchHousehold('hh-1')).rejects.toBe(error)
  })

  it('fetchKid returns the first kid in the household', async () => {
    fromMock.mockReturnValue(queryResult({ data: { id: 'kid-1' }, error: null }))
    await expect(fetchKid('hh-1')).resolves.toEqual({ id: 'kid-1' })
  })
})

describe('list fetchers', () => {
  beforeEach(() => fromMock.mockReset())

  it('fetchChapterEvents coalesces null data to an empty array', async () => {
    fromMock.mockReturnValue(queryResult({ data: null, error: null }))
    await expect(fetchChapterEvents('chap-1')).resolves.toEqual([])
  })

  it('fetchChapterEvents returns the rows', async () => {
    fromMock.mockReturnValue(
      queryResult({ data: [{ id: 'e1' }, { id: 'e2' }], error: null }),
    )
    await expect(fetchChapterEvents('chap-1')).resolves.toHaveLength(2)
  })

  it('fetchRewardTiers throws on error', async () => {
    const error = new Error('tiers down')
    fromMock.mockReturnValue(queryResult({ data: null, error }))
    await expect(fetchRewardTiers('hh-1')).rejects.toBe(error)
  })
})

describe('mutations', () => {
  beforeEach(() => fromMock.mockReset())

  it('removeStickerEvent targets the id and resolves', async () => {
    const builder = queryResult({ error: null })
    fromMock.mockReturnValue(builder)
    await removeStickerEvent('evt-9')
    expect(builder.eq).toHaveBeenCalledWith('id', 'evt-9')
  })

  it('removeStickerEvent throws on error', async () => {
    const error = new Error('delete failed')
    fromMock.mockReturnValue(queryResult({ error }))
    await expect(removeStickerEvent('evt-9')).rejects.toBe(error)
  })

  it('clearChapterStickers deletes by chapter id', async () => {
    const builder = queryResult({ error: null })
    fromMock.mockReturnValue(builder)
    await clearChapterStickers('chap-1')
    expect(builder.eq).toHaveBeenCalledWith('chapter_id', 'chap-1')
  })
})

describe('rpc wrappers', () => {
  beforeEach(() => rpcMock.mockReset())

  it('redeemChapter returns the new chapter id and forwards args', async () => {
    rpcMock.mockResolvedValue({ data: 'new-chapter-id', error: null })
    const id = await redeemChapter({
      kidId: 'kid-1',
      chapterId: 'chap-1',
      rewardTierId: 'tier-1',
      redeemedBy: 'parent-1',
    })
    expect(id).toBe('new-chapter-id')
    expect(rpcMock).toHaveBeenCalledWith('redeem_chapter', {
      p_kid_id: 'kid-1',
      p_chapter_id: 'chap-1',
      p_reward_tier_id: 'tier-1',
      p_redeemed_by: 'parent-1',
    })
  })

  it('createHousehold forwards named args and resolves on success', async () => {
    rpcMock.mockResolvedValue({ error: null })
    await createHousehold({
      householdName: 'Home',
      parentName: 'Pat',
      kidName: 'Kit',
    })
    expect(rpcMock).toHaveBeenCalledWith('create_household', {
      p_household_name: 'Home',
      p_parent_name: 'Pat',
      p_kid_name: 'Kit',
    })
  })

  it('createHousehold throws on rpc error', async () => {
    const error = new Error('rpc failed')
    rpcMock.mockResolvedValue({ error })
    await expect(
      createHousehold({
        householdName: 'Home',
        parentName: 'Pat',
        kidName: 'Kit',
      }),
    ).rejects.toBe(error)
  })

  it('joinHousehold forwards the join code and parent name', async () => {
    rpcMock.mockResolvedValue({ error: null })
    await joinHousehold({ joinCode: 'ABC123', parentName: 'Sam' })
    expect(rpcMock).toHaveBeenCalledWith('join_household', {
      p_join_code: 'ABC123',
      p_parent_name: 'Sam',
    })
  })
})
