/**
 * Authorization — a single pure function and a small role→action matrix.
 *
 * Wiki.js scatters `WIKI.auth.checkAccess(...)` calls across resolvers and
 * models. Here every decision flows through `can()`, so the policy is one
 * readable, testable table.
 */

export type Role = 'admin' | 'editor' | 'viewer'

export type Action =
  | 'page:read'
  | 'page:write'
  | 'page:delete'
  | 'admin:access'

/** `null` principal = anonymous/unauthenticated request. */
export interface Principal {
  readonly id: string
  readonly role: Role
}

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  viewer: new Set<Action>(['page:read']),
  editor: new Set<Action>(['page:read', 'page:write', 'page:delete']),
  admin: new Set<Action>(['page:read', 'page:write', 'page:delete', 'admin:access']),
}

/** Anonymous users may read; everything else requires a role that grants it. */
export const can = (principal: Principal | null, action: Action): boolean => {
  if (principal === null) return action === 'page:read'
  return MATRIX[principal.role].has(action)
}
