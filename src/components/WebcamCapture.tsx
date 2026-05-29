import { useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../lib/errors'

interface WebcamCaptureProps {
  // Receives the captured frame as a PNG File, ready for the sticker pipeline.
  onCapture: (file: File) => void
  onClose: () => void
}

// Desktop webcam capture modal. Opens the default camera via getUserMedia,
// shows a live preview, and snaps the current frame to a PNG File. The stream
// is always stopped on unmount (and on capture/cancel) so the camera light
// doesn't linger.
export function WebcamCapture({ onCapture, onClose }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setReady(true)
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err))
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Could not capture the photo.')
      return
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Could not capture the photo.')
        return
      }
      onCapture(new File([blob], 'photo.png', { type: 'image/png' }))
    }, 'image/png')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="text-center text-lg font-semibold text-ink">Take a photo</h2>

        {error ? (
          <>
            <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
              Couldn&rsquo;t open the camera. {error} You can use &ldquo;Upload&rdquo;
              instead.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mt-4 aspect-square w-full overflow-hidden rounded-2xl border border-black/10 bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={!ready}
                onClick={capture}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {ready ? 'Capture' : 'Starting camera…'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
