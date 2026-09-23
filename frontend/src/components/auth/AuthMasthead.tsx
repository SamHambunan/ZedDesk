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
      <div className="w-12 h-12 rounded-lg bg-[#16181C] border border-[#282A33] flex items-center justify-center font-mono font-bold text-base text-[#F1F3F7] shadow-inner relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#F59E0B]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <span>
          Z<span className="text-[#F59E0B]">D</span>
        </span>
      </div>
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#F1F3F7] font-sans">
          {title}
        </h1>
        <p className="text-xs text-[#8890A0] mt-1">
          {subtitle}
        </p>
      </div>
    </header>
  )
}

export default AuthMasthead

