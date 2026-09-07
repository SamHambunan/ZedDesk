import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SubdomainPreviewBox } from './SubdomainPreviewBox'

describe('SubdomainPreviewBox', () => {
  it('renders valid subdomain with positive sentiment indicator and check icon', () => {
    render(
      <SubdomainPreviewBox
        slug="acmecorp"
        status="valid"
        validationMessage="Subdomain is valid and available"
      />
    )

    expect(screen.getByText('https://acmecorp.zeddesk.app')).toBeInTheDocument()
    expect(screen.getByText('Subdomain is valid and available')).toBeInTheDocument()
    expect(screen.getByTestId('validation-indicator')).toHaveClass('text-sentiment-positive')
  })

  it('renders empty slug fallback with placeholder domain', () => {
    render(
      <SubdomainPreviewBox
        slug=""
        status="idle"
      />
    )

    expect(screen.getByText('https://[slug].zeddesk.app')).toBeInTheDocument()
  })

  it('renders error state with critical sentiment indicator and error message', () => {
    render(
      <SubdomainPreviewBox
        slug="admin"
        status="invalid"
        validationMessage="This subdomain is reserved by the system"
      />
    )

    expect(screen.getByText('https://admin.zeddesk.app')).toBeInTheDocument()
    expect(screen.getByText('This subdomain is reserved by the system')).toBeInTheDocument()
    expect(screen.getByTestId('validation-indicator')).toHaveClass('text-sentiment-critical')
  })
})
