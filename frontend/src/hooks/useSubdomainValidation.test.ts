import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSubdomainValidation, transformToSlug } from './useSubdomainValidation'

describe('useSubdomainValidation', () => {
  it('returns idle state for empty slug', () => {
    const { result } = renderHook(() => useSubdomainValidation(''))
    expect(result.current.isValid).toBe(false)
    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe('')
  })

  it('validates a valid subdomain slug successfully', () => {
    const { result } = renderHook(() => useSubdomainValidation('acme-corp'))
    expect(result.current.isValid).toBe(true)
    expect(result.current.status).toBe('valid')
    expect(result.current.message).toBe('Subdomain is valid and available')
    expect(result.current.normalizedSlug).toBe('acme-corp')
  })

  it('warns when slug is shorter than 3 characters', () => {
    const { result } = renderHook(() => useSubdomainValidation('ac'))
    expect(result.current.isValid).toBe(false)
    expect(result.current.status).toBe('warning')
    expect(result.current.message).toMatch(/at least 3 characters/i)
  })

  it('flags reserved slugs immediately as invalid', () => {
    const reservedList = ['api', 'admin', 'www', 'central', 'app', 'support', 'billing']
    for (const reserved of reservedList) {
      const { result } = renderHook(() => useSubdomainValidation(reserved))
      expect(result.current.isValid).toBe(false)
      expect(result.current.status).toBe('invalid')
      expect(result.current.message).toMatch(/reserved/i)
    }
  })

  it('flags invalid regex patterns (hyphen start/end, uppercase, special chars)', () => {
    const invalidList = ['-acme', 'acme-', 'acme--corp', 'acme_corp', 'acme.corp', 'acme corp']
    for (const invalid of invalidList) {
      const { result } = renderHook(() => useSubdomainValidation(invalid))
      expect(result.current.isValid).toBe(false)
      expect(result.current.status).toBe('invalid')
      expect(result.current.message).toMatch(/lowercase alphanumeric/i)
    }
  })

  describe('transformToSlug helper', () => {
    it('transforms organization name into clean hyphenated lowercase slug', () => {
      expect(transformToSlug('Acme Corporation')).toBe('acme-corporation')
      expect(transformToSlug('  Cyberdyne   Systems! ')).toBe('cyberdyne-systems')
      expect(transformToSlug('ZedDesk #1')).toBe('zeddesk-1')
    })
  })
})
