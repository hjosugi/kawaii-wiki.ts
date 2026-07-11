import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Action } from '@kawaii-wiki/core'
import type { DB } from '../client.ts'
import { isUniqueConstraintError } from '../errors.ts'
import { groupMemberships, groups, pageRules, permissionGrants } from '../schema.ts'
import {
  DuplicateAuthzGroupError,
  type AuthzRepository,
} from '../../repositories/authz.ts'

export const createSqliteAuthzRepository = (db: DB): AuthzRepository => ({
  async ensureDefaults(defaultGroups, defaultGrants) {
    db.transaction((tx) => {
      for (const group of defaultGroups) {
        tx.insert(groups).values(group).onConflictDoNothing().run()
      }
      for (const grant of defaultGrants) {
        const existing = tx
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
          .get()
        if (!existing) tx.insert(permissionGrants).values(grant).run()
      }
    })
  },

  async groupsForUser(userId) {
    const rows = db
      .select({ key: groups.key })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .where(eq(groupMemberships.userId, userId))
      .all()
    return rows.map((row) => row.key)
  },

  async listPermissionGrants() {
    return db.select().from(permissionGrants).all().map((row) => ({ ...row, action: row.action as Action }))
  },

  async syncRoleGroup(userId, roleGroupKey, roleGroupKeys, createdAt) {
    db.transaction((tx) => {
      const roleGroups = tx.select().from(groups).where(inArray(groups.key, [...roleGroupKeys])).all()
      const target = roleGroups.find((group) => group.key === roleGroupKey)
      if (!target) return
      const otherRoleGroupIds = roleGroups.filter((group) => group.id !== target.id).map((group) => group.id)
      if (otherRoleGroupIds.length > 0) {
        tx.delete(groupMemberships)
          .where(and(
            eq(groupMemberships.userId, userId),
            inArray(groupMemberships.groupId, otherRoleGroupIds),
          ))
          .run()
      }
      const existing = tx.select({ id: groupMemberships.id }).from(groupMemberships)
        .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, target.id)))
        .get()
      if (!existing) {
        tx.insert(groupMemberships)
          .values({ id: crypto.randomUUID(), userId, groupId: target.id, createdAt })
          .run()
      }
    })
  },

  async listGroups() {
    return db
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
      .all()
      .map((group) => ({ ...group, members: Number(group.members) }))
  },

  async findGroup(key) {
    return db.select().from(groups).where(eq(groups.key, key)).get()
  },

  async insertGroup(group) {
    try {
      db.insert(groups).values(group).run()
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new DuplicateAuthzGroupError()
      throw error
    }
  },

  async addUserToGroup(userId, groupKey, createdAt) {
    const group = db.select().from(groups).where(eq(groups.key, groupKey)).get()
    if (!group) return null
    const existing = db.select({ id: groupMemberships.id }).from(groupMemberships)
      .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, group.id)))
      .get()
    if (!existing) {
      db.insert(groupMemberships)
        .values({ id: crypto.randomUUID(), userId, groupId: group.id, createdAt })
        .run()
    }
    return group.key
  },

  async removeUserFromGroup(userId, groupKey) {
    const group = db.select().from(groups).where(eq(groups.key, groupKey)).get()
    if (!group) return null
    db.delete(groupMemberships)
      .where(and(eq(groupMemberships.userId, userId), eq(groupMemberships.groupId, group.id)))
      .run()
    return group.key
  },

  async listPageRules() {
    return db.select().from(pageRules).orderBy(asc(pageRules.createdAt)).all()
      .map((row) => ({ ...row, action: row.action as Action }))
  },

  async insertPageRule(rule) {
    db.insert(pageRules).values(rule).run()
  },

  async deletePageRule(id) {
    db.delete(pageRules).where(eq(pageRules.id, id)).run()
  },
})
