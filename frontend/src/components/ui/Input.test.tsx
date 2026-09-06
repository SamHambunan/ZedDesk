import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input Primitive', () => {
  it('renders input with dark slate background and 4px micro-radius', () => {
    render(<Input placeholder="Search tickets..." />)
    const input = screen.getByPlaceholderText('Search tickets...')
    expect(input).toBeInTheDocument()
    expect(input.className).toContain('bg-surface-subpanel')
    expect(input.className).toContain('rounded')
  })

  it('accepts typing and triggers onChange', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Input placeholder="Email" onChange={handleChange} />)
    const input = screen.getByPlaceholderText('Email')
    await user.type(input, 'test@example.com')
    expect(handleChange).toHaveBeenCalled()
    expect(input).toHaveValue('test@example.com')
  })

  it('renders trailing badge like ⌘K', () => {
    render(<Input placeholder="Quick search..." trailingBadge="⌘K" />)
    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })

  it('renders leading icon when provided', () => {
    render(
      <Input
        placeholder="Search..."
        leadingIcon={<span data-testid="search-icon">🔍</span>}
      />
    )
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('renders label and error message when error is provided', () => {
    render(
      <Input
        label="Organization Name"
        error="This name is already taken"
        placeholder="Acme Corp"
      />
    )
    expect(screen.getByText('Organization Name')).toBeInTheDocument()
    expect(screen.getByText('This name is already taken')).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Acme Corp')
    expect(input.className).toContain('border-sentiment-negative')
  })

  it('disables input when disabled prop is true', () => {
    render(<Input placeholder="Disabled" disabled />)
    const input = screen.getByPlaceholderText('Disabled')
    expect(input).toBeDisabled()
    expect(input.className).toContain('disabled:opacity-50')
  })

  it('features luminous focus border styling', () => {
    render(<Input placeholder="Focus test" />)
    const input = screen.getByPlaceholderText('Focus test')
    expect(input.className).toContain('focus:border-primary-container')
    expect(input.className).toContain('focus:ring-accent-indigo-glow/30')
  })
})
