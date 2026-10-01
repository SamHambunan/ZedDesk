import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const axiosError = err as {
      response?: { data?: { message?: string; errors?: Record<string, string[]> } }
      message?: string
    }
    if (axiosError.response?.data?.message) return axiosError.response.data.message
    if (axiosError.response?.data?.errors) {
      return Object.values(axiosError.response.data.errors).flat().join(', ')
    }
    if (axiosError.message) return axiosError.message
  }
  return fallback
}
