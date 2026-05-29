// Client-side sticker image processing: downscale to a small square-ish bound,
// re-encode to WebP (which drops EXIF/metadata as a side effect), and keep the
// upload tiny. Stickers render at ~48px, so 256px is plenty.

const MAX_DIMENSION = 256
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const OUTPUT_TYPE = 'image/webp'
const OUTPUT_QUALITY = 0.9

// Autocrop tuning. A pixel counts as "visible" once its alpha clears the
// threshold (keeps faint anti-aliased fringe from inflating the box), and the
// crop keeps a little proportional breathing room so the subject isn't flush
// against the sticker edge.
const ALPHA_THRESHOLD = 8
const CROP_PADDING_RATIO = 0.03

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

// Tighten a transparent cutout to its subject and centre that subject in a
// square. Background removal leaves wide, uneven transparent margins, so without
// this the subject floats off-centre and at an inconsistent size. We crop to the
// bounding box of visible pixels (plus a little padding), then letterbox it into
// a square canvas so every sticker shares one centred footprint — the board
// renders stickers in a square slot with object-contain. Returns a PNG to
// preserve transparency; feed it through processStickerImage() afterward to
// resize + re-encode for upload.
export async function autoCropTransparent(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { width, height } = bitmap
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not process the image.')
    }
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, width, height)

    const bounds = alphaBounds(data, width, height)
    if (!bounds) {
      // Nothing visible (fully transparent) — leave the cutout untouched.
      return blob
    }

    const pad = Math.round(
      Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) *
        CROP_PADDING_RATIO,
    )
    const left = Math.max(0, bounds.minX - pad)
    const top = Math.max(0, bounds.minY - pad)
    const right = Math.min(width - 1, bounds.maxX + pad)
    const bottom = Math.min(height - 1, bounds.maxY + pad)
    const cropWidth = right - left + 1
    const cropHeight = bottom - top + 1

    // Letterbox the cropped subject into a square, centred on both axes. The
    // shorter axis gets equal transparent margins, so the subject lands dead
    // centre and fills the board's square sticker slot consistently.
    const side = Math.max(cropWidth, cropHeight)
    const out = document.createElement('canvas')
    out.width = side
    out.height = side
    const outCtx = out.getContext('2d')
    if (!outCtx) {
      throw new Error('Could not process the image.')
    }
    outCtx.drawImage(
      canvas,
      left,
      top,
      cropWidth,
      cropHeight,
      Math.round((side - cropWidth) / 2),
      Math.round((side - cropHeight) / 2),
      cropWidth,
      cropHeight,
    )
    return await canvasToBlob(out, 'image/png', 1)
  } finally {
    bitmap.close()
  }
}

// Tightest box of pixels whose alpha clears ALPHA_THRESHOLD. Returns null when
// every pixel is (near-)transparent.
function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    return null
  }
  return { minX, minY, maxX, maxY }
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
