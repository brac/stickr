import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the heavy WASM background-removal lib so tests never load it.
const { removeBackgroundMock } = vi.hoisted(() => ({
  removeBackgroundMock: vi.fn(),
}))
vi.mock('@imgly/background-removal', () => ({
  removeBackground: removeBackgroundMock,
}))

import { processStickerImage, removeImageBackground } from './imageProcessing'

// The resize/encode path relies on createImageBitmap + canvas.toBlob, which
// jsdom doesn't implement, so these tests pin the input-validation guards that
// run before any canvas work. The happy path is covered by E2E.

function fakeFile(type: string, size: number): File {
  const file = new File(['x'], 'sticker', { type })
  // Override size without allocating a real megabyte buffer.
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('processStickerImage validation', () => {
  it('rejects non-image files', async () => {
    await expect(processStickerImage(fakeFile('application/pdf', 10))).rejects.toThrow(
      'Please choose an image file.',
    )
  })

  it('rejects SVG uploads explicitly', async () => {
    await expect(
      processStickerImage(fakeFile('image/svg+xml', 10)),
    ).rejects.toThrow('SVG uploads are not supported. Use PNG, JPG, or WebP.')
  })

  it('rejects images larger than 15 MB', async () => {
    const tooBig = fakeFile('image/png', 15 * 1024 * 1024 + 1)
    await expect(processStickerImage(tooBig)).rejects.toThrow(
      'That image is too large (max 15 MB).',
    )
  })
})

describe('removeImageBackground', () => {
  beforeEach(() => removeBackgroundMock.mockReset())

  it('rejects non-image files before loading the model', async () => {
    await expect(
      removeImageBackground(fakeFile('application/pdf', 10)),
    ).rejects.toThrow('Please choose an image file.')
    expect(removeBackgroundMock).not.toHaveBeenCalled()
  })

  it('delegates an image file to the background-removal model', async () => {
    const cutout = new Blob(['x'], { type: 'image/png' })
    removeBackgroundMock.mockResolvedValue(cutout)
    const file = fakeFile('image/jpeg', 1000)

    await expect(removeImageBackground(file)).resolves.toBe(cutout)
    // Passes the file plus the iOS-tuned config (smallest model, CPU backend).
    expect(removeBackgroundMock).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ model: 'isnet_quint8', device: 'cpu' }),
    )
  })
})
