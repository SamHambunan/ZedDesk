import React, { createContext, useContext, useEffect, useRef, useId } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalContextValue {
  open: boolean
  onClose: () => void
  titleId: string
  descId: string
}

const ModalContext = createContext<ModalContextValue | null>(null)

function useModalContext(): ModalContextValue {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('Modal compound components must be rendered inside a Modal.Root')
  }
  return context
}

export interface ModalRootProps {
  open?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  children: React.ReactNode
  className?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}

export const ModalRoot: React.FC<ModalRootProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  children,
  className,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) => {
  const isModalOpen = open ?? isOpen ?? false
  const handleClose = () => {
    onOpenChange?.(false)
    onClose?.()
  }

  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const handleCloseRef = useRef(handleClose)
  useEffect(() => {
    handleCloseRef.current = handleClose
  })

  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!isModalOpen) return

    previousActiveElement.current = document.activeElement as HTMLElement

    // Focus first focusable element in modal, or the dialog itself
    if (dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      } else {
        dialogRef.current.focus()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault()
        handleCloseRef.current()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    // Prevent background scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isModalOpen, closeOnEscape])

  if (!isModalOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      handleClose()
    }
  }

  return (
    <ModalContext.Provider value={{ open: isModalOpen, onClose: handleClose, titleId, descId }}>
      <div
        data-testid="modal-backdrop"
        onClick={handleBackdropClick}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity animate-in fade-in duration-150"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          tabIndex={-1}
          className={cn(
            'relative w-full max-w-lg bg-surface-subpanel border border-white/10 rounded-lg shadow-modal text-on-surface overflow-hidden outline-none',
            className
          )}
        >
          {children}
        </div>
      </div>
    </ModalContext.Provider>
  )
}
ModalRoot.displayName = 'Modal.Root'

export interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ className, children, ...props }) => (
  <div
    className={cn('flex items-start justify-between p-5 pb-4 border-b border-border-subtle', className)}
    {...props}
  >
    {children}
  </div>
)
ModalHeader.displayName = 'Modal.Header'

export interface ModalTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h2' | 'h3' | 'h4'
}

export const ModalTitle: React.FC<ModalTitleProps> = ({
  as: Component = 'h2',
  className,
  children,
  ...props
}) => {
  const { titleId } = useModalContext()
  return (
    <Component
      id={titleId}
      className={cn('text-base font-semibold text-on-surface tracking-tight leading-6', className)}
      {...props}
    >
      {children}
    </Component>
  )
}
ModalTitle.displayName = 'Modal.Title'

export interface ModalDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const ModalDescription: React.FC<ModalDescriptionProps> = ({
  className,
  children,
  ...props
}) => {
  const { descId } = useModalContext()
  return (
    <p
      id={descId}
      className={cn('text-xs text-on-surface-variant leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  )
}
ModalDescription.displayName = 'Modal.Description'

export interface ModalCloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({
  className,
  children,
  'aria-label': ariaLabel = 'Close modal',
  ...props
}) => {
  const { onClose } = useModalContext()
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClose}
      className={cn(
        'p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo-glow cursor-pointer',
        className
      )}
      {...props}
    >
      {children || <X className="w-4 h-4" />}
    </button>
  )
}
ModalCloseButton.displayName = 'Modal.CloseButton'

export interface ModalBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalBody: React.FC<ModalBodyProps> = ({ className, children, ...props }) => (
  <div className={cn('p-5', className)} {...props}>
    {children}
  </div>
)
ModalBody.displayName = 'Modal.Body'

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalFooter: React.FC<ModalFooterProps> = ({ className, children, ...props }) => (
  <div
    className={cn(
      'px-5 py-4 border-t border-border-subtle flex items-center justify-end gap-3 bg-surface-subpanel',
      className
    )}
    {...props}
  >
    {children}
  </div>
)
ModalFooter.displayName = 'Modal.Footer'

export interface ModalProps extends ModalRootProps {
  title?: React.ReactNode
  description?: React.ReactNode
}

export function Modal({
  isOpen,
  open,
  onClose,
  onOpenChange,
  title,
  description,
  children,
  className,
  closeOnBackdrop,
  closeOnEscape,
}: ModalProps) {
  return (
    <ModalRoot
      open={open ?? isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      className={className}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
    >
      {(title || description) && (
        <ModalHeader>
          <div className="space-y-1">
            {title && <ModalTitle>{title}</ModalTitle>}
            {description && <ModalDescription>{description}</ModalDescription>}
          </div>
          <ModalCloseButton />
        </ModalHeader>
      )}
      <ModalBody>{children}</ModalBody>
    </ModalRoot>
  )
}

Modal.displayName = 'Modal'
Modal.Root = ModalRoot
Modal.Header = ModalHeader
Modal.Title = ModalTitle
Modal.Description = ModalDescription
Modal.Body = ModalBody
Modal.Footer = ModalFooter
Modal.CloseButton = ModalCloseButton

