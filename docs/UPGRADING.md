<!-- i18n: language-switcher -->
[English](UPGRADING.md) | [日本語](UPGRADING.ja.md)

# Upgrading and rollback

## Before upgrading

1. Read `CHANGELOG.md` and verify the target image tag.
2. Back up the active primary database **and** asset storage using the matching
   procedure below. Test the restore before proceeding.
3. Stop additional application instances so only one process performs startup
   migrations.
4. Pull and start the new image with the same persistent `/data` volume.
5. Check `/api/health`, which now performs a database query, then verify login,
   page read, asset access, and search. Check Admin → Backends for the active
   database, search index, retry backlog, and asset backend.

Schema migrations run automatically at startup and are verified against the
selected driver. Do not rely on a down migration: database rollback is
restore-based. Built-in and Elasticsearch search data are derived and can be
rebuilt from the primary database.

## Backup and restore matrix

Keep database and asset backups from the same maintenance window. A Git content
mirror and an Elasticsearch snapshot are not full wiki backups.

### SQLite and local libSQL

For SQLite, make an online backup and copy local assets:

```bash
sqlite3 /data/ts-wiki.sqlite ".backup '/backups/kawaii-wiki.sqlite'"
rsync -a /data/assets/ /backups/assets/
```

For a local libSQL file, stop all application instances before copying the
database file and its adjacent WAL/SHM files. Restore into an empty data
directory, keep the original permissions, and start the same image/config that
created the backup.

For remote libSQL/Turso, use the provider's backup, point-in-time recovery, or
export facility. `LIBSQL_REPLICA_PATH` and its `.bus-reader` file are caches,
not authoritative backups.

### PostgreSQL

Use a managed snapshot or `pg_dump --format=custom` with a credential service
file/secret injection. Test `pg_restore` into a separate empty database. Keep
the dump, the exact image tag, and the non-secret configuration together in the
recovery record.

### MySQL/MariaDB

Use a managed snapshot or `mysqldump --single-transaction --routines --triggers`
with credentials supplied by `--defaults-extra-file` or the platform secret
store. Test the dump by restoring it into a separate empty database.

### Local assets and R2

Local assets live under `DATA_DIR/assets` and must be copied with the database
backup. For R2, enable bucket versioning/retention where available and export or
replicate the bucket independently. The database contains asset metadata; R2
contains the bytes, so both are required for a complete restore.

## Moving SQLite to PostgreSQL or MySQL

`db:migrate-to` copies every canonical table from SQLite into a **fresh, empty**
PostgreSQL or MySQL database, rebuilds the target search index, and can verify
per-table row counts and checksums. It does not copy local/R2 asset bytes.

1. Stop every application instance and back up the SQLite source and assets.
2. Create an empty target database and a least-privilege application account.
3. Set `DATABASE_DRIVER`, `DATABASE_URL`, `DATABASE_SSL`, and optionally
   `DATABASE_POOL_MAX` for the target in a maintenance shell.
4. Run dry-run, apply, then verify:

```bash
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite --dry-run
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite
bun run db:migrate-to --to postgres --from /data/ts-wiki.sqlite --verify
```

Use `--to mysql` with `DATABASE_DRIVER=mysql` for MySQL/MariaDB. The apply step
refuses a non-empty target. After verification, start exactly one application
instance on the target, check health/auth/pages/assets/search, and then restore
the normal replica count.

There is no automatic PostgreSQL ↔ MySQL migration or reverse migration to
SQLite/libSQL. Export a remote libSQL primary to a verified SQLite-compatible
file before using this command. Keep the source read-only and intact until the
new backend has passed a full backup/restore drill.

## Switching search backends

To enable Elasticsearch, back up the primary database, set `SEARCH_BACKEND` and
the `ELASTICSEARCH_*` variables, restart, then run the Admin search rebuild. The
rebuild writes a versioned index and atomically swaps the live alias. Monitor
pending/dead-letter outbox counts before declaring the switch complete.

To return to built-in search, set `SEARCH_BACKEND=fts5`, restart, and rebuild the
active built-in index from Admin. Elasticsearch can be removed after the
built-in results and ACL behavior are verified. It is always a derived copy;
database writes remain authoritative during an Elasticsearch outage.

## Secret handling

- Store `DATABASE_URL`, `LIBSQL_AUTH_TOKEN`, `ELASTICSEARCH_*` credentials,
  `R2_*` credentials, and `JWT_SECRET` in the platform secret manager or mounted
  secret files. Never put real values in Git, Admin config templates, shell
  history, or issue logs.
- Use TLS for remote services and credentials restricted to the application
  database/schema, Elasticsearch index prefix, or R2 bucket.
- Rotate credentials after a suspected disclosure and before deleting the old
  backend. Keep backups encrypted and restrict restore permissions.

## Rollback

Application rollback is **restore-based**: stop the new image, restore the
pre-upgrade database and assets, then start the previous immutable image tag.
Do not point an older image at a database already migrated by a newer major or
minor release unless that changelog explicitly says it is supported.

Keep the old image and backup until the upgraded wiki has passed normal traffic
and a fresh post-upgrade backup has completed.

For a database-backend cutover, switching the environment variable back is safe
only while the old source has remained read-only. Once the new backend accepts
writes, stop traffic and restore a consistent backup; do not alternate between
divergent databases. A search-backend rollback does not roll back page data, but
the selected search index must be rebuilt after restart.

For the repository's Compose setup:

```bash
docker compose pull
docker compose up -d
```

The default `:1` tag follows compatible 1.x releases. Set
`KAWAII_WIKI_VERSION` to an exact version when every update must be approved
manually. Never run `docker compose down -v` during an update because `-v`
deletes the wiki data volume.
