/**
 * Delete the SQLite database files. `bun run db:reset` (then re-seed).
 */
import { rmSync } from 'node:fs'
import { loadEnv } from '../env.ts'

const env = loadEnv()
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(env.databasePath + suffix, { force: true })
}
console.log(`✓ removed ${env.databasePath}`)
