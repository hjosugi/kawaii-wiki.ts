import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Action } from '@kawaii-wiki/core'
import { isUniqueConstraintError } from '../../errors.ts'
import type { MysqlDb } from '../client.ts'
import { groupMemberships, groups, pageRules, permissionGrants } from '../schema.ts'
import {
  DuplicateAuthzGroupError,
  type AuthzRepository,
} from '../../../repositories/authz.ts'

/** MySQL implementation of the driver-neutral authorization contract. */
export const createMysqlAuthzRepository = (db: MysqlDb): AuthzRepository => ({
  async ensureDefaults(defaultGroups, defaultGrants) {
    await db.transaction(async (tx) => {
      for (const group of defaultGroups) {
        await tx.insert(groups).ignore().values(group)
      }
      for (const grant of defaultGrants) {
        const [existing] = await tx
          .select({ id: permissionGrants.id })
          .from(permissionGrants)
          .where(and(
            eq(permissionGrants.subjectType, grant.subjectType),
            grant.subjectId === null
              ? sql`${permissionGrants.subjectId} IS NULL`
              : eq(permissionGrants.subjectId, grant.subjectId),
            eq(permissionGrants.action, grant.action),
            eq(permissionGrants.effect, grant.effect),
          ))
          .limit(1)
        if (!existing) await tx.insert(permissionGrants).values(grant)
      }
    })
  },

  async groupsForUser(userId) {
    const rows = await db
      .select({ key: groups.key })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .where(eq(groupMemberships.userId, userId))
    return rows.map((row) => row.key)
  },

  async listPermissionGrants() {
    const rows = await db.select().from(permissionGrants)
    return rows.map((row) => ({ ...row, action: row.action as Action }))
  },

  async syncRoleGroup(userId, roleGroupKey, roleGroupKeys, createdAt) {
    await db.transaction(async (tx) => {
      const roleGroups = await tx.select().from(groups).where(inArray(groups.key, [...roleGroupKeys]))
      const target = roleGroups.find((group) => group.key === roleGroupKey)
      if (!target) return
      const otherRoleGroupIds = roleGroups.filter((group) => group.id !== target.id).map((group) => group.id)
      if (otherRoleGroupIds.length > 0) {
        await tx
          .delete(groupMemberships)
          .where(and(eq(groupMemberships.userId, userId), inArray(groupMemberships.groupId, otherRoleGroupIds)))
      }
      const [existing] = await tx
        .select({ id: groupMemberships.id })
        .from(groupMemberships)
        .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, target.id)))
        .limit(1)
      if (!existing) {
        await tx.insert(groupMemberships).values({ id: crypto.randomUUID(), userId, groupId: target.id, createdAt })
      }
    })
  },

  async listGroups() {
    const rows = await db
      .select({
        id: groups.id,
        key: groups.key,
        name: groups.name,
        description: groups.description,
        createdAt: groups.createdAt,
        members: sql<number>`count(${groupMemberships.id})`,
      })
      .from(groups)
      .leftJoin(groupMemberships, eq(groups.id, groupMemberships.groupId))
      .groupBy(groups.id)
      .orderBy(asc(groups.key))
    return rows.map((group) => ({ ...group, members: Number(group.members) }))
  },

  async findGroup(key) {
    const [row] = await db.select().from(groups).where(eq(groups.key, key)).limit(1)
    return row
  },

  async insertGroup(group) {
    try {
      await db.insert(groups).values(group)
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new DuplicateAuthzGroupError()
      throw error
    }
  },

  async addUserToGroup(userId, groupKey, createdAt) {
    const [group] = await db.select().from(groups).where(eq(groups.key, groupKey)).limit(1)
    if (!group) return null
    const [existing] = await db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, group.id)))
      .limit(1)
    if (!existing) {
      await db.insert(groupMemberships).values({ id: crypto.randomUUID(), userId, groupId: group.id, createdAt })
    }
    return group.key
  },

  async removeUserFromGroup(userId, groupKey) {
    const [group] = await db.select().from(groups).where(eq(groups.key, groupKey)).limit(1)
    if (!group) return null
    await db
      .delete(groupMemberships)
      .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, group.id)))
    return group.key
  },

  async listPageRules() {
    const rows = await db.select().from(pageRules).orderBy(asc(pageRules.createdAt))
    return rows.map((row) => ({ ...row, action: row.action as Action }))
  },

  async insertPageRule(rule) {
    await db.insert(pageRules).values(rule)
  },

  async deletePageRule(id) {
    await db.delete(pageRules).where(eq(pageRules.id, id))
  },
})
