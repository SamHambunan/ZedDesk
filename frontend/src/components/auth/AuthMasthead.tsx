import React from 'react'
import { Sparkles } from 'lucide-react'
import { authContentData } from '../../data/mockData'

export interface AuthMastheadProps {
  readonly title?: string
  readonly subtitle?: string
  readonly className?: string
}

export const AuthMasthead: React.FC<AuthMastheadProps> = ({
  title = authContentData.brand.name,
  subtitle = authContentData.brand.subtitle,
  className = '',
}) => {
  return (
    <header className={`flex flex-col items-center text-center space-y-4 ${className}`}>
      <div className="w-16 h-16 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-center surface-level-2 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#38BDF8]/10 to-[#818CF8]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <Sparkles className="w-8 h-8 text-[#38BDF8]" />
      </div>
      <div>
        <h1 className="font-display-lg text-display-lg bg-gradient-to-r from-[#38BDF8] to-[#818CF8] bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="font-body-default text-body-default text-text-secondary mt-1">
          {subtitle}
        </p>
      </div>
    </header>
  )
}

export default AuthMasthead

