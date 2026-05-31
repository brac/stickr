import { useEffect, useState } from 'react'
import { signKidAvatarUrl } from '../lib/kidAvatars'
import type { Kid } from '../lib/types'

// The floor of the fallback chain — used wherever a kid has no photo or emoji.
export const DEFAULT_KID_EMOJI = '🧒'

type AvatarSize = 'sm' | 'md' | 'lg'

interface KidAvatarProps {
  kid: Kid
  size?: AvatarSize
  // When there's no photo, render the emoji fallback. Off by default so the
  // boards and switcher show nothing until a real photo is set; the kid setup
  // menu opts in so a parent can still see and edit the placeholder.
  allowEmojiFallback?: boolean
}

// px dimensions per size, so the <img> has explicit width/height (no CLS).
const SIZE_PX: Record<AvatarSize, number> = { sm: 36, md: 56, lg: 96 }
const EMOJI_CLASS: Record<AvatarSize, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
}

// Resolves a kid's avatar: uploaded cutout → chosen emoji → default emoji.
// A background-removed photo renders as a die-cut sticker — a white outline
// hugging its silhouette, no disc. The emoji fallback sits on a clean white
// round sticker so both read as stickers, not grey badges.
export function KidAvatar({
  kid,
  size = 'md',
  allowEmojiFallback = false,
}: KidAvatarProps) {
  const px = SIZE_PX[size]

  // The bucket is private, so resolve the photo to a short-lived signed URL.
  // Track which path the signed result belongs to so readiness is derived (no
  // synchronous setState in the effect): the photo is "ready" only once a result
  // for the current avatar_path has arrived.
  const [signed, setSigned] = useState<{ path: string; url: string | null }>({
    path: '',
    url: null,
  })

  useEffect(() => {
    let active = true
    const path = kid.avatar_path
    if (!path) return
    signKidAvatarUrl(path)
      .then((url) => {
        if (active) setSigned({ path, url })
      })
      .catch(() => {
        if (active) setSigned({ path, url: null })
      })
    return () => {
      active = false
    }
  }, [kid.avatar_path])

  if (kid.avatar_path) {
    const ready = signed.path === kid.avatar_path
    if (ready && signed.url) {
      return (
        <img
          src={signed.url}
          alt={kid.name}
          width={px}
          height={px}
          loading="lazy"
          draggable={false}
          className="die-cut shrink-0 object-contain"
          style={{ width: px, height: px }}
        />
      )
    }
    if (!ready) {
      // Photo still signing: hold its space silently — no emoji flash, no CLS.
      return (
        <span
          aria-hidden="true"
          className="inline-block shrink-0"
          style={{ width: px, height: px }}
        />
      )
    }
    // ready && no url → signing failed; fall through to the emoji fallback.
  }

  // No photo (or it failed to sign): only the setup kid menu shows the emoji
  // placeholder; everywhere else renders nothing.
  if (!allowEmojiFallback) {
    return null
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_3px_rgba(40,30,20,0.28)] ${EMOJI_CLASS[size]} leading-none`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={kid.name}
    >
      {kid.avatar_emoji ?? DEFAULT_KID_EMOJI}
    </span>
  )
}
