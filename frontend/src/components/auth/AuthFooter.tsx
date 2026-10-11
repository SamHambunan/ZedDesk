import React from 'react'
import { Lock } from 'lucide-react'

export interface AuthFooterProps {
  readonly sessionText?: string
  readonly architectureText?: string
  readonly routingText?: string
  readonly className?: string
}

export const AuthFooter: React.FC<AuthFooterProps> = ({
  sessionText = 'Secure access for your organization',
  architectureText,
  className = '',
}) => {
  return (
    <footer className={`text-center space-y-2 pb-8 ${className}`}>
      <div className="flex items-center justify-center gap-2 text-text-secondary text-xs">
        <Lock className="w-3.5 h-3.5 text-primary-container" />
        <span>{sessionText}</span>
      </div>
      {architectureText && <p className="text-xs text-text-muted max-w-xs mx-auto">{architectureText}</p>}
    </footer>
  )
}

export default AuthFooter
