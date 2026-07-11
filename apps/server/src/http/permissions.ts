import {
  requirePermission,
  type Action,
  type PermissionResource,
  type Principal,
} from '@kawaii-wiki/core'
import { HttpError } from './errors.ts'

export const requireHttpPermission = (
  principal: Principal | null,
  action: Action,
  resource: PermissionResource = {},
): void => {
  const allowed = requirePermission(principal, action, resource)
  if (!allowed.ok) throw new HttpError(allowed.error)
}
