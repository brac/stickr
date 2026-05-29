import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock, storageFromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFromMock: vi.fn(),
  rpcMock: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { from: fromMock, storage: { from: storageFromMock }, rpc: rpcMock },
}))
vi.mock('./imageProcessing', () => ({
  processStickerImage: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
}))

import {
  kidAvatarUrl,
  uploadKidAvatar,
  removeKidAvatar,
  setKidAvatarEmoji,
} from './kidAvatars'
import type { Kid } from './types'

const upload = vi.fn()
const remove = vi.fn()
const getPublicUrl = vi.fn()

function file(): File {
  return new File(['x'], 'face.png', { type: 'image/png' })
}

function kid(overrides: Partial<Kid> = {}): Kid {
  return {
    id: 'kid-1',
    household_id: 'hh-1',
    name: 'Ava',
    current_balance: 0,
    current_chapter_id: null,
    avatar_path: null,
    avatar_emoji: null,
    created_at: '2026-01-01',
    ...overrides,
  }
}

beforeEach(() => {
  fromMock.mockReset()
  rpcMock.mockReset().mockResolvedValue({ error: null })
  upload.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  getPublicUrl.mockReset()
  storageFromMock.mockReset().mockReturnValue({ upload, remove, getPublicUrl })
})

describe('kidAvatarUrl', () => {
  it('returns the public URL for a storage path', () => {
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/a.webp' } })
    expect(kidAvatarUrl('hh-1/kid-1/a.webp')).toBe('https://cdn/a.webp')
  })
})

describe('uploadKidAvatar', () => {
  it('uploads under a unique path, points the kid row at it, and prunes the old photo', async () => {
    fromMock.mockReturnValue(
      queryResult({ data: { avatar_path: 'hh-1/kid-1/old.webp' }, error: null }),
    )

    const path = await uploadKidAvatar({
      file: file(),
      householdId: 'hh-1',
      kidId: 'kid-1',
    })

    expect(path).toMatch(/^hh-1\/kid-1\/.*\.webp$/)
    expect(upload.mock.calls[0][0]).toBe(path)
    expect(rpcMock).toHaveBeenCalledWith('set_kid_avatar_path', {
      p_kid_id: 'kid-1',
      p_path: path,
    })
    expect(remove).toHaveBeenCalledWith(['hh-1/kid-1/old.webp'])
  })

  it('does not prune anything when the kid had no previous photo', async () => {
    fromMock.mockReturnValue(queryResult({ data: { avatar_path: null }, error: null }))

    await uploadKidAvatar({ file: file(), householdId: 'hh-1', kidId: 'kid-1' })

    expect(remove).not.toHaveBeenCalled()
  })

  it('removes the just-uploaded object if pointing the row at it fails', async () => {
    fromMock.mockReturnValue(queryResult({ data: { avatar_path: null }, error: null }))
    rpcMock.mockResolvedValue({ error: { message: 'rpc failed' } })

    await expect(
      uploadKidAvatar({ file: file(), householdId: 'hh-1', kidId: 'kid-1' }),
    ).rejects.toThrow('rpc failed')

    const uploadedPath = upload.mock.calls[0][0] as string
    expect(remove).toHaveBeenCalledWith([uploadedPath])
  })
})

describe('removeKidAvatar', () => {
  it('clears the row and deletes the stored object', async () => {
    await removeKidAvatar(kid({ avatar_path: 'hh-1/kid-1/a.webp' }))

    expect(rpcMock).toHaveBeenCalledWith('set_kid_avatar_path', {
      p_kid_id: 'kid-1',
      p_path: null,
    })
    expect(remove).toHaveBeenCalledWith(['hh-1/kid-1/a.webp'])
  })

  it('skips storage removal when there was no photo', async () => {
    await removeKidAvatar(kid({ avatar_path: null }))
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('setKidAvatarEmoji', () => {
  it('calls the RPC with the chosen emoji', async () => {
    await setKidAvatarEmoji('kid-1', '🦊')
    expect(rpcMock).toHaveBeenCalledWith('set_kid_avatar_emoji', {
      p_kid_id: 'kid-1',
      p_emoji: '🦊',
    })
  })
})
