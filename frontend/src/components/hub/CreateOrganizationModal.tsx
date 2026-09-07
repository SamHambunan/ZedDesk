import React, { useState, useEffect, useRef } from 'react'
import { Building2, X, Info, Rocket } from 'lucide-react'
import { createOrgModalData } from '../../data/mockData'
import { SubdomainPreviewBox } from './SubdomainPreviewBox'
import {
  useSubdomainValidation,
  transformToSlug,
  sanitizeSubdomainInput,
} from '../../hooks/useSubdomainValidation'

export interface CreateOrganizationModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSubmit: (data: { readonly name: string; readonly slug: string }) => Promise<void> | void
  readonly isSubmitting?: boolean
  readonly error?: string | null
  readonly onClearError?: () => void
  readonly className?: string
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = null,
  onClearError,
  className = '',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)

  const validation = useSubdomainValidation(slug)

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setName('')
      setSlug('')
      setIsSlugManuallyEdited(false)
    }
  }

  // Accessibility: focus trap, escape key listener, backdrop overflow
  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement as HTMLElement

    if (dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        dialogRef.current.focus()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')

        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const firstElement = focusables[0]
        const lastElement = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error && onClearError) onClearError()
    const newName = e.target.value
    setName(newName)
    if (!isSlugManuallyEdited) {
      setSlug(transformToSlug(newName))
    }
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error && onClearError) onClearError()
    setIsSlugManuallyEdited(true)
    setSlug(sanitizeSubdomainInput(e.target.value))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validation.isValid || !name.trim() || isSubmitting) return
    onSubmit({ name: name.trim(), slug: slug.trim() })
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      data-testid="create-org-modal-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-surface-panel/70 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity animate-in fade-in duration-150"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`relative z-50 w-full max-w-[560px] bg-surface-subpanel rounded-lg shadow-modal border border-white/[0.08] flex flex-col shadow-keylight outline-none ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-border-subtle flex items-center justify-center text-text-secondary">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="font-headline-sm text-headline-sm text-text-primary font-semibold" id="modal-title">
              {createOrgModalData.title}
            </h2>
          </div>
          <button
            aria-label="Close modal"
            onClick={onClose}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent-glow rounded p-1 cursor-pointer"
            type="button"
          >
            <span className="font-mono-data text-mono-data bg-surface-container-high px-1.5 py-0.5 rounded border border-border-subtle text-text-muted">
              ESC
            </span>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 flex flex-col gap-6 text-left">
            {error && (
              <div
                role="alert"
                className="bg-sentiment-critical/10 border border-sentiment-critical/20 rounded-lg p-3 text-sentiment-critical text-body-compact"
              >
                {error}
              </div>
            )}

            {/* Organization Name */}
            <div className="flex flex-col gap-2">
              <label className="font-label-regular text-label-regular text-text-secondary" htmlFor="modal-org-name">
                {createOrgModalData.orgNameLabel}
              </label>
              <input
                id="modal-org-name"
                name="org-name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder={createOrgModalData.orgNamePlaceholder}
                className="w-full h-8 bg-container-low border border-border-prominent rounded text-text-primary placeholder:text-text-muted font-body-default text-body-default px-3 focus:outline-none focus:border-accent-glow/40 focus:ring-1 focus:ring-accent-glow/40 transition-colors"
                required
              />
            </div>

            {/* Subdomain Slug */}
            <div className="flex flex-col gap-2">
              <label className="font-label-regular text-label-regular text-text-secondary" htmlFor="modal-subdomain">
                {createOrgModalData.subdomainLabel}
              </label>
              <div className="flex w-full">
                <input
                  id="modal-subdomain"
                  name="subdomain"
                  type="text"
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder={createOrgModalData.subdomainPlaceholder}
                  className="flex-1 h-8 bg-container-low border border-r-0 border-border-prominent rounded-l text-text-primary placeholder:text-text-muted font-mono-data text-mono-data px-3 focus:outline-none focus:border-accent-glow/40 focus:ring-1 focus:ring-accent-glow/40 transition-colors z-10"
                  required
                />
                <div className="h-8 flex items-center px-3 bg-surface-container-high border border-border-prominent rounded-r border-l-0 text-text-muted font-mono-data text-mono-data select-none z-0">
                  {createOrgModalData.subdomainSuffix}
                </div>
              </div>

              {/* Subdomain Preview */}
              <SubdomainPreviewBox
                slug={slug}
                status={validation.status}
                validationMessage={validation.message}
              />
            </div>

            {/* Info Callout */}
            <div className="bg-container-low border border-border-subtle rounded-lg p-4 flex gap-3">
              <Info className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-title-md text-title-md text-text-primary font-semibold">
                  {createOrgModalData.infoCallout.title}
                </span>
                <span className="font-body-compact text-body-compact text-text-secondary">
                  {createOrgModalData.infoCallout.prefix}
                  <strong className="text-text-primary font-medium">
                    {createOrgModalData.infoCallout.role}
                  </strong>
                  {createOrgModalData.infoCallout.suffix}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-3 bg-surface-subpanel rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 font-label-regular text-label-regular text-text-secondary hover:text-text-primary hover:bg-surface-container-high rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent-glow cursor-pointer"
            >
              {createOrgModalData.cancelButton}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !validation.isValid || !name.trim()}
              className="h-8 px-4 bg-primary-container text-white font-label-regular text-label-regular rounded shadow-keylight-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-accent-glow focus:ring-offset-2 focus:ring-offset-surface-subpanel flex items-center gap-2 cursor-pointer"
            >
              <span>
                {isSubmitting
                  ? createOrgModalData.submittingButton
                  : createOrgModalData.submitButton}
              </span>
              <Rocket className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateOrganizationModal
