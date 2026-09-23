import React, { useState } from 'react'
import { AlertCircle, Loader2, Send } from 'lucide-react'
import { CustomerFileDropzone } from './CustomerFileDropzone'
import type { CreateTicketPayload } from '../../hooks/useCustomerPortal'

export interface CustomerIntakeFormProps {
  onSubmit: (payload: CreateTicketPayload) => Promise<void>
  isSubmitting: boolean
  error?: string | null
}

export interface FormErrors {
  name?: string
  email?: string
  subject?: string
  message?: string
}

export const CustomerIntakeForm: React.FC<CustomerIntakeFormProps> = ({
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState('medium')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  const validate = (): boolean => {
    const errors: FormErrors = {}

    if (!name.trim()) {
      errors.name = 'Please provide your full name.'
    }

    if (!email.trim()) {
      errors.email = 'Please provide your email address.'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        errors.email = 'Please provide a valid email address.'
      }
    }

    if (!subject.trim()) {
      errors.subject = 'Please provide a subject for your ticket.'
    }

    if (!message.trim()) {
      errors.message = 'Please provide a detailed message describing your inquiry.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    await onSubmit({
      name,
      email,
      subject,
      priority,
      message,
      attachments: files,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header / Intro */}
      <header className="border-b border-border-subtle pb-5">
        <h1 className="text-headline-md font-headline-md text-text-primary tracking-tight">
          Submit a Support Request
        </h1>
        <p className="text-body-sm text-text-secondary mt-1.5 leading-relaxed">
          Describe your inquiry or issue below and our support agents will assist you promptly.
        </p>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div
          data-testid="portal-error-message"
          className="p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl text-sentiment-negative text-body-sm flex items-start gap-3 animate-in fade-in duration-150"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to submit ticket</p>
            <p className="text-xs text-sentiment-negative/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Name and Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="portal-name"
              className="block text-label-sm font-medium text-text-secondary mb-1.5"
            >
              Your Full Name <span className="text-sentiment-negative">*</span>
            </label>
            <input
              id="portal-name"
              data-testid="portal-customer-name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }))
              }}
              placeholder="e.g. Alice Freeman"
              className={`w-full h-10 px-3.5 bg-surface-canvas border rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow transition-colors ${
                fieldErrors.name ? 'border-sentiment-negative' : 'border-border-subtle'
              }`}
            />
            {fieldErrors.name && (
              <p data-testid="portal-error-name" className="text-[11px] text-sentiment-negative mt-1">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="portal-email"
              className="block text-label-sm font-medium text-text-secondary mb-1.5"
            >
              Email Address <span className="text-sentiment-negative">*</span>
            </label>
            <input
              id="portal-email"
              data-testid="portal-customer-email"
              type="email"
              required
              disabled={isSubmitting}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
              }}
              placeholder="e.g. alice@example.com"
              className={`w-full h-10 px-3.5 bg-surface-canvas border rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow transition-colors ${
                fieldErrors.email ? 'border-sentiment-negative' : 'border-border-subtle'
              }`}
            />
            {fieldErrors.email && (
              <p data-testid="portal-error-email" className="text-[11px] text-sentiment-negative mt-1">
                {fieldErrors.email}
              </p>
            )}
          </div>
        </div>

        {/* Subject & Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="portal-subject"
              className="block text-label-sm font-medium text-text-secondary mb-1.5"
            >
              Subject <span className="text-sentiment-negative">*</span>
            </label>
            <input
              id="portal-subject"
              data-testid="portal-ticket-subject"
              type="text"
              required
              disabled={isSubmitting}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                if (fieldErrors.subject) setFieldErrors((prev) => ({ ...prev, subject: undefined }))
              }}
              placeholder="Brief summary of your inquiry"
              className={`w-full h-10 px-3.5 bg-surface-canvas border rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow transition-colors ${
                fieldErrors.subject ? 'border-sentiment-negative' : 'border-border-subtle'
              }`}
            />
            {fieldErrors.subject && (
              <p data-testid="portal-error-subject" className="text-[11px] text-sentiment-negative mt-1">
                {fieldErrors.subject}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="portal-priority"
              className="block text-label-sm font-medium text-text-secondary mb-1.5"
            >
              Priority
            </label>
            <select
              id="portal-priority"
              data-testid="portal-ticket-priority"
              disabled={isSubmitting}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full h-10 px-3 bg-surface-canvas border border-border-subtle rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow transition-colors"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="portal-message"
            className="block text-label-sm font-medium text-text-secondary mb-1.5"
          >
            Detailed Message <span className="text-sentiment-negative">*</span>
          </label>
          <textarea
            id="portal-message"
            data-testid="portal-ticket-message"
            required
            disabled={isSubmitting}
            rows={5}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              if (fieldErrors.message) setFieldErrors((prev) => ({ ...prev, message: undefined }))
            }}
            placeholder="Describe your issue or inquiry in detail..."
            className={`w-full p-3.5 bg-surface-canvas border rounded-lg text-text-primary text-body-sm focus:outline-none focus:border-accent-indigo-glow transition-colors ${
              fieldErrors.message ? 'border-sentiment-negative' : 'border-border-subtle'
            }`}
          />
          {fieldErrors.message && (
            <p data-testid="portal-error-message-field" className="text-[11px] text-sentiment-negative mt-1">
              {fieldErrors.message}
            </p>
          )}
        </div>

        {/* Dropzone */}
        <CustomerFileDropzone
          files={files}
          onFilesChange={setFiles}
          disabled={isSubmitting}
        />

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            data-testid="portal-submit-btn"
            disabled={isSubmitting}
            className="w-full h-11 bg-primary-container hover:bg-primary-dark text-white font-medium text-label-md rounded-lg shadow-keylight-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting Request...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Support Request</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
