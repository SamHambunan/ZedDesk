/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface-canvas': '#0B0F19',
        'surface-panel': '#0F172A',
        'surface-subpanel': '#1E293B',
        'surface-container': '#171F33',
        'surface-container-low': '#131B2E',
        'surface-container-high': '#222A3D',
        'surface-container-highest': '#2D3449',
        'surface-container-lowest': '#060E20',
        'container-high': '#222A3D',
        'container-highest': '#2D3449',
        'border-subtle': '#1E293B',
        'border-prominent': '#334155',
        'primary-container': '#4F46E5',
        'primary-dark': '#4338CA',
        'accent-indigo-glow': '#6366F1',
        'secondary': '#8B5CF6',
        'secondary-light': '#D0BCFF',
        'sentiment-positive': '#10B981',
        'sentiment-neutral': '#94A3B8',
        'sentiment-warning': '#F59E0B',
        'sentiment-negative': '#F43F5E',
        'ai-confidence-high': '#10B981',
        'ai-confidence-medium': '#F59E0B',
        'ai-confidence-low': '#EF4444',
        'workflow-n8n-orange': '#FF6D5A',
        'on-surface': '#F8FAFC',
        'on-surface-variant': '#94A3B8',
        'outline': '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem', // 4px
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.5rem',        // 8px
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        'keylight': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'keylight-primary': 'inset 0 1px 0 rgba(255, 255, 255, 0.20)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        'luminous-indigo': '0 0 0 1px #4F46E5, 0 0 12px rgba(99, 102, 241, 0.35)',
      },
    },
  },
  plugins: [],
}
