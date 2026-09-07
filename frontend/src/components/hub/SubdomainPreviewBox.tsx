import React from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { createOrgModalData } from '../../data/mockData'

export interface SubdomainPreviewBoxProps {
  readonly slug: string
  readonly status?: 'valid' | 'invalid' | 'warning' | 'idle'
  readonly validationMessage?: string
  readonly className?: string
}

export const SubdomainPreviewBox: React.FC<SubdomainPreviewBoxProps> = ({
  slug,
  status = 'idle',
  validationMessage,
  className = '',
}) => {
  const displayUrl = slug
    ? `${createOrgModalData.previewProtocol}${slug}${createOrgModalData.subdomainSuffix}`
    : createOrgModalData.previewPlaceholderDomain

  const renderStatus = () => {
    if (!validationMessage && status === 'idle') {
      return null
    }

    let textColor = 'text-text-muted'
    let Icon = Info

    if (status === 'valid') {
      textColor = 'text-sentiment-positive'
      Icon = CheckCircle2
    } else if (status === 'invalid') {
      textColor = 'text-sentiment-critical'
      Icon = AlertCircle
    } else if (status === 'warning') {
      textColor = 'text-sentiment-warning'
      Icon = AlertCircle
    }

    return (
      <div
        data-testid="validation-indicator"
        className={`flex items-center gap-1.5 ${textColor}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="font-label-regular text-label-regular">
          {validationMessage || (status === 'valid' ? createOrgModalData.validSubdomainMessage : '')}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`bg-container-lowest border border-border-subtle rounded-lg p-3 flex flex-col gap-2 ${className}`}
    >
      <div className="font-mono-data text-mono-data text-accent-glow break-all">
        {displayUrl}
      </div>
      {renderStatus()}
    </div>
  )
}

export default SubdomainPreviewBox
