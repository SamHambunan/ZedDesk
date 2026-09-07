import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CreateOrganizationModal } from './CreateOrganizationModal'

describe('CreateOrganizationModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <CreateOrganizationModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders accessible Level 3 dialog with all elements when isOpen is true', () => {
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: /create new organization/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/workspace subdomain url/i)).toBeInTheDocument()
    expect(screen.getByText('.zeddesk.app')).toBeInTheDocument()
    expect(screen.getByText(/admin role assignment/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create organization & launch/i })).toBeInTheDocument()
  })

  it('auto-generates subdomain slug from organization name until slug is manually edited', async () => {
    const user = userEvent.setup()
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    const orgNameInput = screen.getByLabelText(/organization name/i)
    const slugInput = screen.getByLabelText(/workspace subdomain url/i)

    await user.type(orgNameInput, 'Mega Corp')
    expect(slugInput).toHaveValue('mega-corp')
    expect(screen.getByText('https://mega-corp.zeddesk.app')).toBeInTheDocument()
    expect(screen.getByText('Subdomain is valid and available')).toBeInTheDocument()

    // Manually edit slug
    await user.clear(slugInput)
    await user.type(slugInput, 'custom-slug')
    expect(slugInput).toHaveValue('custom-slug')

    // Further edits to org name should not overwrite manually entered slug
    await user.type(orgNameInput, ' Inc')
    expect(slugInput).toHaveValue('custom-slug')
  })

  it('validates reserved slugs and displays validation error', async () => {
    const user = userEvent.setup()
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    const slugInput = screen.getByLabelText(/workspace subdomain url/i)
    await user.type(slugInput, 'admin')

    expect(screen.getByText(/reserved by the system/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create organization & launch/i })).toBeDisabled()
  })

  it('submits valid organization name and slug on submit', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    )

    await user.type(screen.getByLabelText(/organization name/i), 'Acme Solutions')
    const submitBtn = screen.getByRole('button', { name: /create organization & launch/i })
    expect(submitBtn).toBeEnabled()
    await user.click(submitBtn)

    expect(handleSubmit).toHaveBeenCalledWith({
      name: 'Acme Solutions',
      slug: 'acme-solutions',
    })
  })

  it('closes modal on ESC key, close button, and cancel button', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={vi.fn()}
      />
    )

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(handleClose).toHaveBeenCalledTimes(1)

    // Click Close 'X' button
    const closeBtn = screen.getByRole('button', { name: /close modal/i })
    await user.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(2)

    // ESC key
    await user.keyboard('{Escape}')
    expect(handleClose).toHaveBeenCalledTimes(3)
  })

  it('displays API error alert when error prop is provided', () => {
    render(
      <CreateOrganizationModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        error="The slug has already been taken."
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('The slug has already been taken.')
  })
})
