export function validateEmail(val: string): string | null {
  if (!val.trim()) {
    return 'Please provide your email address.'
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(val.trim())) {
    return 'Please provide a valid email address.'
  }
  return null
}
