import { describe, it, expect } from 'vitest'
import { processStickerImage } from './imageProcessing'

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
