import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button Primitive', () => {
  it('renders primary variant with label-regular text and inset keylight style', () => {
    render(<Button variant="primary">Submit</Button>)
    const button = screen.getByRole('button', { name: 'Submit' })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-primary-container')
    expect(button.className).toContain('shadow-keylight-primary')
    expect(button.className).toContain('rounded')
  })

  it('renders secondary and ghost variants', () => {
    const { rerender } = render(<Button variant="secondary">Cancel</Button>)
    let button = screen.getByRole('button', { name: 'Cancel' })
    expect(button.className).toContain('bg-surface-subpanel')
    expect(button.className).toContain('border-border-prominent')

    rerender(<Button variant="ghost">Ghost Option</Button>)
    button = screen.getByRole('button', { name: 'Ghost Option' })
    expect(button.className).toContain('bg-transparent')
    expect(button.className).toContain('text-on-surface-variant')
  })

  it('renders AI action variant with sparkle icon prefix', () => {
    render(<Button variant="ai">Generate Summary</Button>)
    const button = screen.getByRole('button', { name: 'Generate Summary' })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-gradient-to-b')
    // Check for sparkle svg/icon inside
    const sparkleIcon = button.querySelector('svg')
    expect(sparkleIcon).toBeInTheDocument()
  })

  it('handles click events when enabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click Me</Button>)
    const button = screen.getByRole('button', { name: 'Click Me' })
    await user.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('disables interactions and shows spinner when loading', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button isLoading onClick={handleClick}>Loading Action</Button>)
    const button = screen.getByRole('button', { name: 'Loading Action' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('supports compact and standard heights', () => {
    const { rerender } = render(<Button size="compact">Compact</Button>)
    let button = screen.getByRole('button', { name: 'Compact' })
    expect(button.className).toContain('h-8')

    rerender(<Button size="standard">Standard</Button>)
    button = screen.getByRole('button', { name: 'Standard' })
    expect(button.className).toContain('h-9')
  })

  it('features accessible focus ring classes for keyboard navigation', () => {
    render(<Button>Focusable</Button>)
    const button = screen.getByRole('button', { name: 'Focusable' })
    expect(button.className).toContain('focus-visible:ring-accent-indigo-glow')
    button.focus()
    expect(button).toHaveFocus()
  })
})
