import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './Card'

describe('Card Primitive', () => {
  it('renders Surface Level 2 container with 1px border, 8px radius, and keylight highlight', () => {
    render(
      <Card data-testid="test-card">
        <CardContent>Card body</CardContent>
      </Card>
    )
    const card = screen.getByTestId('test-card')
    expect(card).toBeInTheDocument()
    expect(card.className).toContain('bg-surface-subpanel')
    expect(card.className).toContain('border-border-prominent')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('shadow-keylight')
  })

  it('renders full card anatomy with header, title, description, and footer', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
          <CardDescription>Manage organization configurations</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Main content area</p>
        </CardContent>
        <CardFooter>
          <button>Save</button>
        </CardFooter>
      </Card>
    )

    expect(screen.getByText('Organization Settings')).toBeInTheDocument()
    expect(screen.getByText('Manage organization configurations')).toBeInTheDocument()
    expect(screen.getByText('Main content area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
