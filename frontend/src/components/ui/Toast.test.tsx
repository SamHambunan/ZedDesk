import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Toast } from './Toast'

describe('Toast Primitive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render when open is false', () => {
    render(<Toast open={false} message="Operation successful" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tactical-toast')).not.toBeInTheDocument()
  })

  it('renders tactical confirmation toast in bottom-right with message and accessible role', () => {
    render(<Toast open={true} message="Invitation link copied to clipboard" />)

    const toast = screen.getByTestId('tactical-toast')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveAttribute('role', 'status')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Invitation link copied to clipboard')).toBeInTheDocument()

    // Tactical bottom-right styling
    expect(toast.className).toContain('fixed')
    expect(toast.className).toContain('bottom-5')
    expect(toast.className).toContain('right-5')
  })

  it('auto-dismisses after duration', () => {
    const handleClose = vi.fn()
    render(
      <Toast
        open={true}
        onClose={handleClose}
        message="Auto dismiss test"
        duration={3000}
      />
    )

    expect(handleClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('allows manual dismissal via close button', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(
      <Toast
        open={true}
        onClose={handleClose}
        message="Manual dismiss test"
      />
    )

    const closeBtn = screen.getByRole('button', { name: /dismiss/i })
    await user.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
