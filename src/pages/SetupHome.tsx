import { Link } from 'react-router-dom'
import { SetupShell } from '../components/SetupShell'
import { InstallPrompt } from '../components/InstallPrompt'

const LINKS = [
  {
    to: '/setup/kids',
    title: 'Kids',
    description: 'Add or view the kids in your household. Each gets their own board.',
  },
  {
    to: '/setup/chores',
    title: 'Chores',
    description: 'The buttons on the board. Name, value, and which sticker they drop.',
  },
  {
    to: '/setup/stickers',
    title: 'Sticker library',
    description: 'Upload your own sticker images to use on chores.',
  },
  {
    to: '/setup/rewards',
    title: 'Rewards',
    description: 'Set the sticker thresholds and what gets unlocked at each.',
  },
]

export function SetupHome() {
  return (
    <SetupShell title="Setup">
      <nav className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4 transition-colors hover:border-accent/50"
          >
            <span className="flex items-center justify-between">
              <span className="font-medium text-ink">{link.title}</span>
              <span className="text-ink-muted" aria-hidden="true">
                →
              </span>
            </span>
            <span className="mt-1 block text-sm text-ink-muted">
              {link.description}
            </span>
          </Link>
        ))}
      </nav>

      <InstallPrompt />
    </SetupShell>
  )
}
