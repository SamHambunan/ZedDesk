import React from 'react'
import { Lock } from 'lucide-react'

export interface AuthFooterProps {
  readonly sessionText?: string
  readonly architectureText?: string
  readonly routingText?: string
  readonly className?: string
}

export const AuthFooter: React.FC<AuthFooterProps> = ({
  sessionText = 'Laravel Sanctum Encrypted Session',
  architectureText = 'Adhering to ADR-0002 for decoupled identities across multi-tenant infrastructures.',
  className = '',
}) => {
  return (
    <footer className={`text-center space-y-2 pb-8 ${className}`}>
      <div className="flex items-center justify-center gap-2 text-[#8890A0] font-mono text-xs">
        <Lock className="w-3.5 h-3.5 text-[#F59E0B]" />
        <span>{sessionText}</span>
      </div>
      <p className="text-[11px] text-[#525866] max-w-xs mx-auto">
        {architectureText}
      </p>
    </footer>
  )
}

export default AuthFooter
