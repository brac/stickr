import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock, storageFromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFromMock: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { from: fromMock, storage: { from: storageFromMock } },
}))
vi.mock('./imageProcessing', () => ({
  processStickerImage: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
}))

import {
  stickerImageUrl,
  fetchStickerImages,
  uploadStickerImage,
  deleteStickerImage,
} from './stickerImages'
import type { StickerImage } from './types'

const upload = vi.fn()
const remove = vi.fn().mockResolvedValue({ error: null })
const getPublicUrl = vi.fn()

function file(): File {
  return new File(['x'], 'pic.png', { type: 'image/png' })
}

beforeEach(() => {
  fromMock.mockReset()
  upload.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  getPublicUrl.mockReset()
  storageFromMock.mockReset().mockReturnValue({ upload, remove, getPublicUrl })
})

describe('stickerImageUrl', () => {
  it('returns the public URL for a storage path', () => {
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.webp' } })
    expect(stickerImageUrl('hh/x.webp')).toBe('https://cdn/x.webp')
    expect(getPublicUrl).toHaveBeenCalledWith('hh/x.webp')
  })
})

describe('fetchStickerImages', () => {
  it('returns rows, coalescing null to an empty array', async () => {
    fromMock.mockReturnValue(queryResult({ data: null, error: null }))
    await expect(fetchStickerImages('hh-1')).resolves.toEqual([])
  })

  it('throws on error', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(queryResult({ data: null, error }))
    await expect(fetchStickerImages('hh-1')).rejects.toBe(error)
  })
})

describe('uploadStickerImage', () => {
  it('uploads then inserts a row with a trimmed label', async () => {
    const builder = queryResult({ data: { id: 'img-1' }, error: null })
    fromMock.mockReturnValue(builder)

    const result = await uploadStickerImage({
      file: file(),
      householdId: 'hh-1',
      label: '  Gold star  ',
    })

    expect(result).toEqual({ id: 'img-1' })
    const uploadedPath = upload.mock.calls[0][0] as string
    expect(uploadedPath).toMatch(/^hh-1\/.*\.webp$/)
    expect(builder.insert).toHaveBeenCalledWith({
      household_id: 'hh-1',
      storage_path: uploadedPath,
      label: 'Gold star',
    })
  })

  it('stores a null label when the label is blank', async () => {
    const builder = queryResult({ data: { id: 'img-1' }, error: null })
    fromMock.mockReturnValue(builder)

    await uploadStickerImage({ file: file(), householdId: 'hh-1', label: '   ' })

    const payload = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.label).toBeNull()
  })

  it('throws on upload failure without inserting a row', async () => {
    const error = new Error('upload failed')
    upload.mockResolvedValue({ error })
    await expect(
      uploadStickerImage({ file: file(), householdId: 'hh-1', label: 'x' }),
    ).rejects.toBe(error)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('cleans up the uploaded object when the row insert fails', async () => {
    const error = new Error('insert failed')
    fromMock.mockReturnValue(queryResult({ data: null, error }))

    await expect(
      uploadStickerImage({ file: file(), householdId: 'hh-1', label: 'x' }),
    ).rejects.toBe(error)

    const uploadedPath = upload.mock.calls[0][0] as string
    expect(remove).toHaveBeenCalledWith([uploadedPath])
  })
})

describe('deleteStickerImage', () => {
  const image: StickerImage = {
    id: 'img-1',
    household_id: 'hh-1',
    storage_path: 'hh-1/x.webp',
    label: null,
    created_at: '2026-05-28T00:00:00.000Z',
  }

  it('deletes the row then removes the storage object', async () => {
    const builder = queryResult({ error: null })
    fromMock.mockReturnValue(builder)

    await deleteStickerImage(image)

    expect(builder.eq).toHaveBeenCalledWith('id', 'img-1')
    expect(remove).toHaveBeenCalledWith(['hh-1/x.webp'])
  })

  it('throws and skips storage removal when the row delete fails', async () => {
    const error = new Error('delete failed')
    fromMock.mockReturnValue(queryResult({ error }))

    await expect(deleteStickerImage(image)).rejects.toBe(error)
    expect(remove).not.toHaveBeenCalled()
  })
})
