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
  signStickerImageUrls,
  fetchStickerImages,
  uploadStickerImage,
  deleteStickerImage,
} from './stickerImages'
import { processStickerImage } from './imageProcessing'
import type { StickerImage } from './types'

const upload = vi.fn()
const remove = vi.fn().mockResolvedValue({ error: null })
const createSignedUrls = vi.fn()

function file(): File {
  return new File(['x'], 'pic.png', { type: 'image/png' })
}

beforeEach(() => {
  fromMock.mockReset()
  upload.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  createSignedUrls.mockReset()
  storageFromMock.mockReset().mockReturnValue({ upload, remove, createSignedUrls })
})

describe('signStickerImageUrls', () => {
  it('signs a batch and maps signed URLs back to image ids', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'hh/a.webp', signedUrl: 'https://cdn/a.webp?token=1', error: null },
        { path: 'hh/b.webp', signedUrl: 'https://cdn/b.webp?token=2', error: null },
      ],
      error: null,
    })

    const map = await signStickerImageUrls([
      { id: 'img-a', storage_path: 'hh/a.webp' },
      { id: 'img-b', storage_path: 'hh/b.webp' },
    ])

    expect(map).toEqual({
      'img-a': 'https://cdn/a.webp?token=1',
      'img-b': 'https://cdn/b.webp?token=2',
    })
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['hh/a.webp', 'hh/b.webp'],
      expect.any(Number),
    )
  })

  it('returns an empty map and skips storage when there are no images', async () => {
    await expect(signStickerImageUrls([])).resolves.toEqual({})
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('omits images whose individual signing failed', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'hh/a.webp', signedUrl: 'https://cdn/a.webp?token=1', error: null },
        { path: 'hh/b.webp', signedUrl: '', error: 'not found' },
      ],
      error: null,
    })

    const map = await signStickerImageUrls([
      { id: 'img-a', storage_path: 'hh/a.webp' },
      { id: 'img-b', storage_path: 'hh/b.webp' },
    ])

    expect(map).toEqual({ 'img-a': 'https://cdn/a.webp?token=1' })
  })

  it('throws when the batch sign call errors', async () => {
    const error = new Error('sign failed')
    createSignedUrls.mockResolvedValue({ data: null, error })
    await expect(
      signStickerImageUrls([{ id: 'img-a', storage_path: 'hh/a.webp' }]),
    ).rejects.toBe(error)
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

  it('uploads as PNG when the browser falls back from WebP (iOS Safari)', async () => {
    // canvas.toBlob can't encode WebP on iOS Safari, so it hands back a PNG.
    vi.mocked(processStickerImage).mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    )
    fromMock.mockReturnValue(queryResult({ data: { id: 'img-1' }, error: null }))

    await uploadStickerImage({ file: file(), householdId: 'hh-1', label: 'Photo' })

    const uploadedPath = upload.mock.calls[0][0] as string
    const uploadOptions = upload.mock.calls[0][2] as { contentType: string }
    expect(uploadedPath).toMatch(/^hh-1\/.*\.png$/)
    expect(uploadOptions.contentType).toBe('image/png')
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
