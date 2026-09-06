import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge Primitive', () => {
  it('renders uppercase label-caps status badge with pill shape', () => {
    render(<Badge>Active</Badge>)
    const badge = screen.getByText('Active')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('uppercase')
    expect(badge.className).toContain('rounded-full')
    expect(badge.className).toContain('h-5')
    expect(badge.className).toContain('text-[11px]')
  })

  it('renders positive variant with 12% alpha fill and matching border', () => {
    render(<Badge variant="positive">Operational</Badge>)
    const badge = screen.getByText('Operational')
    expect(badge.className).toContain('text-sentiment-positive')
    expect(badge.className).toContain('bg-sentiment-positive/12')
    expect(badge.className).toContain('border-sentiment-positive/25')
  })

  it('renders critical variant with 12% alpha fill and matching border', () => {
    render(<Badge variant="critical">Urgent</Badge>)
    const badge = screen.getByText('Urgent')
    expect(badge.className).toContain('text-sentiment-negative')
    expect(badge.className).toContain('bg-sentiment-negative/12')
    expect(badge.className).toContain('border-sentiment-negative/25')
  })

  it('renders warning, neutral, ai, and workflow variants', () => {
    const { rerender } = render(<Badge variant="warning">Pending</Badge>)
    let badge = screen.getByText('Pending')
    expect(badge.className).toContain('text-sentiment-warning')

    rerender(<Badge variant="neutral">Draft</Badge>)
    badge = screen.getByText('Draft')
    expect(badge.className).toContain('text-sentiment-neutral')

    rerender(<Badge variant="ai">AI Copilot</Badge>)
    badge = screen.getByText('AI Copilot')
    expect(badge.className).toContain('text-secondary-light')

    rerender(<Badge variant="workflow">n8n</Badge>)
    badge = screen.getByText('n8n')
    expect(badge.className).toContain('text-workflow-n8n-orange')
  })

  it('renders status dot indicator when dot prop is provided', () => {
    render(<Badge variant="positive" dot>Online</Badge>)
    const badge = screen.getByText('Online')
    const dot = badge.querySelector('span[data-testid="badge-dot"]')
    expect(dot).toBeInTheDocument()
    expect(dot?.className).toContain('rounded-full')
    expect(dot?.className).toContain('bg-sentiment-positive')
  })
})
