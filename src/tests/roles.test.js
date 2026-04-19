import { describe, expect, it } from 'vitest'
import { canManageKitchen, normalizeRole } from '../utils/roles'

describe('roles utils', () => {
  it('normalizes role values', () => {
    expect(normalizeRole(' Gerente ')).toBe('gerente')
  })

  it('allows kitchen management roles', () => {
    expect(canManageKitchen('cocina')).toBe(true)
    expect(canManageKitchen('manager')).toBe(true)
    expect(canManageKitchen('admin')).toBe(true)
  })

  it('denies waiter role', () => {
    expect(canManageKitchen('waiter')).toBe(false)
  })
})
