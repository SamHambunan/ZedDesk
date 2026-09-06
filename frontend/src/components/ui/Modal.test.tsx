import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal Primitive', () => {
  it('does not render content when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test Modal">
        <p>Hidden Content</p>
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument()
  })

  it('renders Level 3 accessible dialog with backdrop blur when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Create Team">
        <p>Team Content</p>
      </Modal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Create Team')).toBeInTheDocument()
    expect(screen.getByText('Team Content')).toBeInTheDocument()

    // Level 3 styling: shadow-modal, 8px radius, border
    expect(dialog.className).toContain('bg-surface-subpanel')
    expect(dialog.className).toContain('shadow-modal')
    expect(dialog.className).toContain('rounded-lg')
  })

  it('calls onClose when clicking close button', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        <p>Body</p>
      </Modal>
    )
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when pressing Escape key', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        <p>Body</p>
      </Modal>
    )
    await user.keyboard('{Escape}')
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking on backdrop overlay', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog">
        <p>Body</p>
      </Modal>
    )
    const backdrop = screen.getByTestId('modal-backdrop')
    await user.click(backdrop)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('traps focus inside the modal when pressing Tab', async () => {
    const user = userEvent.setup()
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Focus Trap Dialog">
        <input placeholder="First Input" />
        <button>Submit Action</button>
      </Modal>
    )

    const firstInput = screen.getByPlaceholderText('First Input')
    const submitBtn = screen.getByRole('button', { name: 'Submit Action' })
    const closeBtn = screen.getByRole('button', { name: /close/i })

    // DOM order in Modal: close button (header), first input (body), submit button (body)
    closeBtn.focus()
    expect(closeBtn).toHaveFocus()

    await user.tab()
    expect(firstInput).toHaveFocus()

    await user.tab()
    expect(submitBtn).toHaveFocus()

    // Tabbing past the last interactive element should cycle back to the first (closeBtn)
    await user.tab()
    expect(closeBtn).toHaveFocus()

    // Shift-tabbing backwards from the first element cycles to the last (submitBtn)
    await user.tab({ shift: true })
    expect(submitBtn).toHaveFocus()
  })
})
