/**
 * Shared setup for the PostgreSQL integration tests.
 *
 * `waitForPostgres` retries the first connection so a server that is reachable
 * but still finishing cold start (the official image briefly accepts then drops
 * connections during init) does not flake the suite, regardless of how the
 * server's readiness was gated.
 */
import type { PostgresClient } from './client.ts'

export const testPostgresUrl = process.env.KAWAII_WIKI_TEST_POSTGRES_URL?.trim()

export const waitForPostgres = async (client: PostgresClient, attempts = 40): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.ping()
      return
    } catch (error) {
      if (attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}
