import { useMemo } from 'react'
import { createOrgModalData } from '../data/mockData'
import { RESERVED_ORGANIZATION_SLUGS } from '../constants/tenancy'

export interface SubdomainValidationResult {
  readonly isValid: boolean
  readonly status: 'valid' | 'invalid' | 'warning' | 'idle'
  readonly message: string
  readonly normalizedSlug: string
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function transformToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function sanitizeSubdomainInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

export function validateSubdomain(slug: string): SubdomainValidationResult {
  const trimmed = slug.trim()

  if (!trimmed) {
    return {
      isValid: false,
      status: 'idle',
      message: '',
      normalizedSlug: '',
    }
  }

  // Length check: min 3
  if (trimmed.length < 3) {
    return {
      isValid: false,
      status: 'warning',
      message: createOrgModalData.minLengthMessage,
      normalizedSlug: trimmed,
    }
  }

  // Length check: max 63
  if (trimmed.length > 63) {
    return {
      isValid: false,
      status: 'invalid',
      message: 'Subdomain cannot exceed 63 characters',
      normalizedSlug: trimmed,
    }
  }

  // Reserved slug check
  if ((RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(trimmed.toLowerCase())) {
    return {
      isValid: false,
      status: 'invalid',
      message: createOrgModalData.reservedSubdomainMessage,
      normalizedSlug: trimmed,
    }
  }

  // Regex format check
  if (!SLUG_REGEX.test(trimmed)) {
    return {
      isValid: false,
      status: 'invalid',
      message: createOrgModalData.invalidSubdomainMessage,
      normalizedSlug: trimmed,
    }
  }

  return {
    isValid: true,
    status: 'valid',
    message: createOrgModalData.validSubdomainMessage,
    normalizedSlug: trimmed,
  }
}

export function useSubdomainValidation(slug: string): SubdomainValidationResult {
  return useMemo(() => validateSubdomain(slug), [slug])
}
