const KITCHEN_ROLES = new Set(['cocina', 'gerente', 'kitchen', 'manager', 'admin'])

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

export function canManageKitchen(role) {
  return KITCHEN_ROLES.has(normalizeRole(role))
}
