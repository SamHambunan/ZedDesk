import React, { useRef, useState } from 'react'
import { UploadCloud, X, FileText, AlertCircle } from 'lucide-react'

export interface CustomerFileDropzoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  maxFiles?: number
  maxSizeBytes?: number
  disabled?: boolean
}

export const MAX_PORTAL_ATTACHMENTS = 5
export const MAX_PORTAL_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const CustomerFileDropzone: React.FC<CustomerFileDropzoneProps> = ({
  files,
  onFilesChange,
  maxFiles = MAX_PORTAL_ATTACHMENTS,
  maxSizeBytes = MAX_PORTAL_FILE_SIZE,
  disabled = false,
}) => {
  const [dragActive, setDragActive] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const validateAndAddFiles = (incomingFiles: FileList | File[]) => {
    setDropError(null)
    const newFiles = Array.from(incomingFiles)

    if (files.length + newFiles.length > maxFiles) {
      setDropError(`You can upload a maximum of ${maxFiles} files in total.`)
      return
    }

    for (const file of newFiles) {
      if (file.size > maxSizeBytes) {
        setDropError(`"${file.name}" exceeds the maximum 10MB file limit.`)
        return
      }
    }

    onFilesChange([...files, ...newFiles])
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (disabled) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleRemoveFile = (indexToRemove: number) => {
    setDropError(null)
    onFilesChange(files.filter((_, idx) => idx !== indexToRemove))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-label-sm font-medium text-text-secondary">
          Attachments <span className="text-text-muted text-xs font-normal">(Optional, max {maxFiles} files, 10MB each)</span>
        </label>
        <span className="text-xs text-text-muted">
          {files.length}/{maxFiles}
        </span>
      </div>

      <div
        data-testid="portal-dropzone"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors duration-150 flex flex-col items-center justify-center gap-2 ${
          dragActive
            ? 'border-accent-indigo-glow bg-accent-indigo-glow/5'
            : 'border-border-prominent hover:border-accent-indigo-glow/50 bg-surface-canvas/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          data-testid="portal-file-input"
          multiple
          disabled={disabled}
          onChange={handleInputChange}
          className="hidden"
          accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip,.json"
        />
        <div className="w-10 h-10 rounded-full bg-surface-subpanel flex items-center justify-center text-accent-indigo-glow">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            <span className="text-accent-indigo-glow underline underline-offset-2">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-text-muted mt-0.5">Images, PDF, documents, spreadsheets, or archives up to 10MB</p>
        </div>
      </div>

      {dropError && (
        <div data-testid="portal-dropzone-error" className="flex items-center gap-2 text-sentiment-negative text-xs mt-1.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{dropError}</span>
        </div>
      )}

      {files.length > 0 && (
        <ul data-testid="portal-file-list" className="space-y-1.5 mt-2">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              data-testid={`portal-attached-file-${idx}`}
              className="flex items-center justify-between p-2.5 bg-surface-subpanel border border-border-subtle rounded-lg text-body-sm"
            >
              <div className="flex items-center gap-2.5 truncate">
                <FileText className="w-4 h-4 text-accent-indigo-glow flex-shrink-0" />
                <span className="text-text-primary truncate max-w-xs">{file.name}</span>
                <span className="text-text-muted text-xs font-mono">({formatFileSize(file.size)})</span>
              </div>
              <button
                type="button"
                data-testid={`portal-remove-file-${idx}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveFile(idx)
                }}
                className="p-1 text-text-muted hover:text-sentiment-negative rounded transition-colors"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
