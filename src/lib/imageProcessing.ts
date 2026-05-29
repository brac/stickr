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

// Thickness of the baked die-cut sticker border, as a fraction of the cutout's
// larger dimension. ~6% reads as a clean sticker edge once scaled down to the
// avatar sizes. This is the single knob for border thickness.
const STICKER_BORDER_RATIO = 0.06

// Remove a photo's background entirely in-browser, returning a transparent-PNG
// cutout. The model (~10 MB WASM + weights) is imported lazily so it stays out
// of the main bundle and only downloads the first time a parent takes a photo
// (then it's cached by the browser). Feed the result through
// processStickerImage() to resize + re-encode before upload.
//
// Config notes — these are tuned for the lowest-end target (iOS Safari in an
// installed PWA), which is where background removal most often fails with "no
// available backend":
//   - model 'isnet_quint8' is the smallest, quantized model. The default
//     (fp16) can exceed iOS Safari's per-tab WASM memory ceiling and fail to
//     instantiate the ONNX backend. quint8 trades a little edge quality for a
//     much smaller memory footprint — the right call for a 256px sticker.
//   - device 'cpu' pins the WASM/CPU backend. iOS has no stable WebGPU, so
//     don't let the lib probe for one.
// If this still fails on a device, callers fall back to the un-cut photo (see
// makeAvatarSticker / makePhotoSticker), so the feature degrades instead of
// hard-failing.
export async function removeImageBackground(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(file, {
    model: 'isnet_quint8',
    device: 'cpu',
    output: { format: 'image/png' },
  })
}

// Center-crop the largest square out of a photo (object-cover style), as an
// opaque PNG. Used as the fallback when background removal is unavailable on
// the device: the subject won't be cut out, but the sticker is still square and
// usable. Unlike autoCropTransparent (which letterboxes around an alpha
// silhouette), this crops a fully-opaque photo so there are no transparent bars.
async function cropToSquareCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = Math.round((bitmap.width - side) / 2)
    const sy = Math.round((bitmap.height - side) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not process the image.')
    }
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, side, side)
    return await canvasToBlob(canvas, 'image/png', 1)
  } finally {
    bitmap.close()
  }
}

export interface StickerCutoutResult {
  blob: Blob
  // false when background removal failed and we fell back to the full photo.
  backgroundRemoved: boolean
  // The underlying error message when we fell back — surfaced in the UI so an
  // on-device failure can be diagnosed without a desktop Web Inspector.
  fallbackReason?: string
}

// Run the cutout pipeline, degrading to the plain (square-cropped) photo if
// background removal is unavailable on this device. Background removal is the
// only fragile step here — a ~25 MB WASM model that some iOS Safari builds
// can't instantiate — so any failure in it (or the crop that depends on its
// transparency) drops to the fallback rather than erroring out. Non-image
// inputs are rejected up front so a bad file still surfaces a clear message.
async function cutoutOrFallback(file: File): Promise<StickerCutoutResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  try {
    const cutout = await removeImageBackground(file)
    const cropped = await autoCropTransparent(cutout)
    return { blob: cropped, backgroundRemoved: true }
  } catch (err) {
    // Reported, not swallowed: this is the documented signal for the iOS
    // background-removal failure. The user still gets a working sticker.
    console.error(
      '[imageProcessing] background removal unavailable; using the full photo',
      err,
    )
    const fallbackReason = err instanceof Error ? err.message : String(err)
    const square = await cropToSquareCover(file)
    return { blob: square, backgroundRemoved: false, fallbackReason }
  }
}

// Avatar sticker: cutout (or fallback square) with the white die-cut border
// baked on. On the fallback path the border frames the square photo.
export async function makeAvatarSticker(file: File): Promise<StickerCutoutResult> {
  const result = await cutoutOrFallback(file)
  const bordered = await addStickerBorder(result.blob)
  return { ...result, blob: bordered }
}

// Library photo sticker: cutout (or fallback square), no border.
export async function makePhotoSticker(file: File): Promise<StickerCutoutResult> {
  return cutoutOrFallback(file)
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

// Bake a white die-cut border around a transparent cutout: dilate the subject's
// silhouette outward in white, then draw the original on top. This produces a
// true, even outline that follows the alpha shape — unlike stacked CSS
// drop-shadows, which render as visible offset copies on a detailed photo.
// Returns a PNG (transparent outside the border).
export async function addStickerBorder(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { width: w, height: h } = bitmap
    const border = Math.max(1, Math.round(Math.max(w, h) * STICKER_BORDER_RATIO))
    const pad = border + 2
    const outWidth = w + pad * 2
    const outHeight = h + pad * 2

    // A pure-white version of the cutout (alpha preserved) to stamp as the matte.
    const silhouette = document.createElement('canvas')
    silhouette.width = w
    silhouette.height = h
    const silCtx = silhouette.getContext('2d')
    if (!silCtx) {
      throw new Error('Could not process the image.')
    }
    silCtx.drawImage(bitmap, 0, 0)
    silCtx.globalCompositeOperation = 'source-in'
    silCtx.fillStyle = '#ffffff'
    silCtx.fillRect(0, 0, w, h)

    const out = document.createElement('canvas')
    out.width = outWidth
    out.height = outHeight
    const ctx = out.getContext('2d')
    if (!ctx) {
      throw new Error('Could not process the image.')
    }

    // Stamp the white silhouette around a circle; the union is the silhouette
    // dilated by `border` — a smooth outline. 32 steps keeps the edge clean.
    const steps = 32
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2
      ctx.drawImage(
        silhouette,
        pad + Math.cos(angle) * border,
        pad + Math.sin(angle) * border,
      )
    }
    // The photo itself, centered on top of the matte.
    ctx.drawImage(bitmap, pad, pad)

    return await canvasToBlob(out, 'image/png', 1)
  } finally {
    bitmap.close()
  }
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
