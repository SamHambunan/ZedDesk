export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface LoginFormErrors {
  email?: string
  password?: string
}

export interface RegisterFormErrors {
  name?: string
  email?: string
  password?: string
  passwordConfirm?: string
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim())
}

export function validateLoginForm(email: string, password: string): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!email.trim()) {
    errors.email = 'Email is required.'
  } else if (!isValidEmail(email)) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

export function validateRegisterForm(
  name: string,
  email: string,
  password: string,
  passwordConfirm: string
): RegisterFormErrors {
  const errors: RegisterFormErrors = {}

  if (!name.trim()) {
    errors.name = 'Full name is required.'
  }

  if (!email.trim()) {
    errors.email = 'Email is required.'
  } else if (!isValidEmail(email)) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  if (!passwordConfirm) {
    errors.passwordConfirm = 'Please confirm your password.'
  } else if (password !== passwordConfirm) {
    errors.passwordConfirm = 'Passwords do not match.'
  }

  return errors
}
