import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'

// EmptyState renders a Link for href actions, so a router is always needed.
function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('EmptyState', () => {
  it('renders the title and body', () => {
    renderInRouter(<EmptyState title="No chores yet" body="Add your first chore." />)
    expect(screen.getByText('No chores yet')).toBeTruthy()
    expect(screen.getByText('Add your first chore.')).toBeTruthy()
  })

  it('renders without a body or action', () => {
    renderInRouter(<EmptyState title="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('fires the onClick action when its button is pressed', () => {
    const onClick = vi.fn()
    renderInRouter(
      <EmptyState title="Add an image" action={{ label: 'Take a photo', onClick }} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders an href action as a link with the right destination', () => {
    renderInRouter(
      <EmptyState title="No chores yet" action={{ label: 'Add a chore', href: '/setup/chores' }} />,
    )
    const link = screen.getByRole('link', { name: 'Add a chore' })
    expect(link.getAttribute('href')).toBe('/setup/chores')
  })

  it('renders an illustration when provided', () => {
    renderInRouter(
      <EmptyState
        title="The board is ready"
        illustration={<div data-testid="ghost-sticker" />}
      />,
    )
    expect(screen.getByTestId('ghost-sticker')).toBeTruthy()
  })
})
