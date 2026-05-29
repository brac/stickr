import { kidAvatarUrl } from '../lib/kidAvatars'
import type { Kid } from '../lib/types'

// The floor of the fallback chain — used wherever a kid has no photo or emoji.
export const DEFAULT_KID_EMOJI = '🧒'

type AvatarSize = 'sm' | 'md' | 'lg'

interface KidAvatarProps {
  kid: Kid
  size?: AvatarSize
}

// px dimensions per size, so the <img> has explicit width/height (no CLS).
const SIZE_PX: Record<AvatarSize, number> = { sm: 24, md: 40, lg: 64 }
const EMOJI_CLASS: Record<AvatarSize, string> = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-3xl',
}

// Resolves a kid's avatar: uploaded cutout → chosen emoji → default emoji.
// A background-removed photo renders as a die-cut sticker — a white outline
// hugging its silhouette, no disc. The emoji fallback sits on a clean white
// round sticker so both read as stickers, not grey badges.
export function KidAvatar({ kid, size = 'md' }: KidAvatarProps) {
  const px = SIZE_PX[size]

  if (kid.avatar_path) {
    return (
      <img
        src={kidAvatarUrl(kid.avatar_path)}
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
