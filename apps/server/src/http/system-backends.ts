/**
 * Read-only description of the active storage & search backends, for the Admin
 * "Storage & search" screen (#367). This lives at the HTTP/composition layer,
 * not in the driver-neutral service layer, because the active driver is infra
 * knowledge the services deliberately do not hold.
 */
import type { DatabaseDriver } from '../db/config.ts'
import type { SearchBackend } from '../env.ts'
import type { ElasticsearchHealth } from '../search/elasticsearch/search.ts'
import type { AssetStorageType } from '../storage/assets.ts'

/** The full-text engine each database driver uses for the built-in search. */
export type SearchEngine = 'fts5' | 'tsvector' | 'fulltext'

export type SearchBackendStatus =
  | { readonly backend: 'builtin'; readonly engine: SearchEngine; readonly healthy: boolean }
  | ({ readonly backend: 'elasticsearch'; readonly engine: 'elasticsearch' } & ElasticsearchHealth)

export interface SystemBackendsStatus {
  readonly database: { readonly driver: DatabaseDriver; readonly healthy: boolean }
  readonly search: SearchBackendStatus
  readonly assets: { readonly backend: AssetStorageType; readonly healthy: boolean }
}

/**
 * Which full-text engine backs the built-in search for a given driver. SQLite
 * and libSQL use FTS5; Postgres uses tsvector; MySQL uses a FULLTEXT index.
 */
export const searchEngineForDriver = (driver: DatabaseDriver): SearchEngine =>
  driver === 'postgres' ? 'tsvector' : driver === 'mysql' ? 'fulltext' : 'fts5'

export const describeSystemBackends = (input: {
  readonly databaseDriver: DatabaseDriver
  readonly assetBackend: AssetStorageType
  readonly databaseHealthy: boolean
  readonly searchBackend?: SearchBackend
  readonly elasticsearchHealth?: ElasticsearchHealth
}): SystemBackendsStatus => {
  const search: SearchBackendStatus = input.searchBackend === 'elasticsearch'
    ? {
        backend: 'elasticsearch',
        engine: 'elasticsearch',
        ...(input.elasticsearchHealth ?? { healthy: false, index: null, pending: 0, deadLettered: 0 }),
      }
    : {
        backend: 'builtin',
        engine: searchEngineForDriver(input.databaseDriver),
        healthy: input.databaseHealthy,
      }
  return {
    database: { driver: input.databaseDriver, healthy: input.databaseHealthy },
    search,
    // Local storage is always available; R2 is not actively probed yet, so its
    // presence in config is reported as healthy until a live probe is added.
    assets: { backend: input.assetBackend, healthy: true },
  }
}
