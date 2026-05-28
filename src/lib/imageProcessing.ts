// Client-side sticker image processing: downscale to a small square-ish bound,
// re-encode to WebP (which drops EXIF/metadata as a side effect), and keep the
// upload tiny. Stickers render at ~48px, so 256px is plenty.

const MAX_DIMENSION = 256
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const OUTPUT_TYPE = 'image/webp'
const OUTPUT_QUALITY = 0.9

// Remove a photo's background entirely in-browser, returning a transparent-PNG
// cutout. The model (~10 MB WASM + weights) is imported lazily so it stays out
// of the main bundle and only downloads the first time a parent takes a photo
// (then it's cached by the browser). Feed the result through
// processStickerImage() to resize + re-encode before upload.
export async function removeImageBackground(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(file)
}

export async function processStickerImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  if (file.type === 'image/svg+xml') {
    throw new Error('SVG uploads are not supported. Use PNG, JPG, or WebP.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is too large (max 15 MB).')
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not process the image.')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await canvasToBlob(canvas, OUTPUT_TYPE, OUTPUT_QUALITY)
  } finally {
    bitmap.close()
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not encode the image.'))
        }
      },
      type,
      quality,
    )
  })
}
