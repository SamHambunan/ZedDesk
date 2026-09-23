import React, { useState, useEffect } from 'react'
import { Building2, Rocket, Info } from 'lucide-react'
import { createOrgModalData } from '../../data/mockData'
import { SubdomainPreviewBox } from './SubdomainPreviewBox'
import { Modal } from '../ui/Modal'
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
  readonly apiUrl?: string
  readonly token?: string | null
  readonly className?: string
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = null,
  onClearError,
  apiUrl,
  token,
  className = '',
}) => {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)
  const [backendValidation, setBackendValidation] = useState<{
    status?: 'valid' | 'invalid'
    message?: string
  } | null>(null)

  const validation = useSubdomainValidation(slug)

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setName('')
      setSlug('')
      setIsSlugManuallyEdited(false)
      setBackendValidation(null)
    }
  }

  // Live asynchronous backend availability check
  useEffect(() => {
    if (!validation.isValid || !slug.trim() || !apiUrl) {
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${apiUrl}/api/organizations/check-slug?slug=${encodeURIComponent(slug.trim())}`, {
          headers,
        })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            if (data.available === false) {
              setBackendValidation({
                status: 'invalid',
                message: data.message || 'This subdomain is already taken.',
              })
            } else {
              setBackendValidation({
                status: 'valid',
                message: data.message || 'Subdomain is valid and available',
              })
            }
          }
        }
      } catch {
        // Fallback gracefully on network error or offline environment
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, validation.isValid, apiUrl, token])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error && onClearError) onClearError()
    setBackendValidation(null)
    const newName = e.target.value
    setName(newName)
    if (!isSlugManuallyEdited) {
      setSlug(transformToSlug(newName))
    }
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error && onClearError) onClearError()
    setBackendValidation(null)
    setIsSlugManuallyEdited(true)
    setSlug(sanitizeSubdomainInput(e.target.value))
  }

  const effectiveBackendValidation =
    !validation.isValid || !slug.trim() || !apiUrl ? null : backendValidation
  const effectiveStatus = effectiveBackendValidation?.status ?? validation.status
  const effectiveMessage = effectiveBackendValidation?.message ?? validation.message
  const isAvailable = validation.isValid && effectiveBackendValidation?.status !== 'invalid'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAvailable || !name.trim() || isSubmitting) return
    onSubmit({ name: name.trim(), slug: slug.trim() })
  }

  return (
    <Modal.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className={`max-w-[560px] ${className}`}
    >
      {/* Header */}
      <Modal.Header>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-border-subtle flex items-center justify-center text-text-secondary">
            <Building2 className="w-4 h-4" />
          </div>
          <Modal.Title className="font-headline-sm text-headline-sm text-text-primary font-semibold">
            {createOrgModalData.title}
          </Modal.Title>
        </div>
        <Modal.CloseButton />
      </Modal.Header>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Modal.Body className="p-6 flex flex-col gap-6 text-left">
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
              status={effectiveStatus}
              validationMessage={effectiveMessage}
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
        </Modal.Body>

        {/* Footer */}
        <Modal.Footer className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-3 bg-surface-subpanel rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 font-label-regular text-label-regular text-text-secondary hover:text-text-primary hover:bg-surface-container-high rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent-glow cursor-pointer"
          >
            {createOrgModalData.cancelButton}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isAvailable || !name.trim()}
            className="h-8 px-4 bg-primary-container text-white font-label-regular text-label-regular rounded shadow-keylight-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-accent-glow focus:ring-offset-2 focus:ring-offset-surface-subpanel flex items-center gap-2 cursor-pointer"
          >
            <span>
              {isSubmitting
                ? createOrgModalData.submittingButton
                : createOrgModalData.submitButton}
            </span>
            <Rocket className="w-4 h-4" />
          </button>
        </Modal.Footer>
      </form>
    </Modal.Root>
  )
}

export default CreateOrganizationModal
