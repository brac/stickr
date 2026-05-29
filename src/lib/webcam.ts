// Decide whether "Take photo" should open a live webcam stream (desktop) or
// fall back to the file input's `capture` attribute (mobile/tablet).
//
// On phones/tablets the OS camera launched by `<input capture>` is a far better
// experience than a custom getUserMedia UI, and `capture` works there. On
// desktop, `capture` is silently ignored (it just opens a file browser), so we
// drive the webcam directly via getUserMedia instead.
export function prefersWebcamCapture(): boolean {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return false
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  // A fine, hovering pointer is the desktop signal; touch devices report
  // `(pointer: coarse)` / `(hover: none)` and keep the native camera.
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
