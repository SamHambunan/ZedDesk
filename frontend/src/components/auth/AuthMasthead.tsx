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
    <header className={`flex flex-col items-center text-center space-y-3 ${className}`}>
      <div className="w-14 h-14 rounded-lg bg-surface-panel dark:bg-surface-panel border border-border-subtle dark:border-border-subtle flex items-center justify-center shadow-keylight relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#38BDF8]/10 to-[#818CF8]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <Sparkles className="w-7 h-7 text-accent-indigo-glow dark:text-accent-indigo-glow" />
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#38BDF8] to-[#818CF8] bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="text-xs text-on-surface-variant dark:text-on-surface-variant mt-1 font-medium">
          {subtitle}
        </p>
      </div>
    </header>
  )
}

export default AuthMasthead
