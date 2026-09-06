import React from 'react'
import { Lock } from 'lucide-react'
import { authContentData } from '../../data/mockData'

export interface AuthFooterProps {
  readonly sessionText?: string
  readonly architectureText?: string
  readonly routingText?: string
  readonly className?: string
}

export const AuthFooter: React.FC<AuthFooterProps> = ({
  sessionText = authContentData.footer.sessionSecurity,
  architectureText = authContentData.footer.architectureNote,
  routingText = authContentData.footer.routingNote,
  className = '',
}) => {
  return (
    <footer className={`text-center space-y-1.5 pb-6 ${className}`}>
      <div className="flex items-center justify-center gap-1.5 text-outline dark:text-outline text-xs">
        <Lock className="w-3.5 h-3.5 text-accent-indigo-glow" />
        <span className="font-mono text-[11px]">{sessionText}</span>
      </div>
      <p className="text-[11px] text-outline dark:text-outline leading-relaxed">
        {architectureText}
      </p>
      {routingText && (
        <p className="text-[11px] text-outline/70 dark:text-outline/70 leading-relaxed">
          {routingText}
        </p>
      )}
    </footer>
  )
}

export default AuthFooter
