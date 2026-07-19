#!/usr/bin/env bash
set -euo pipefail

# Provisions a real MySQL server via docker compose and runs the driver
# contracts that must hold on MySQL against it. Mirrors scripts/test-postgres.sh.
# CI provisions MySQL as a service container instead and sets the same env var.

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="${repo_root}/docker-compose.test.yml"

cleanup() {
  docker compose -f "$compose_file" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== starting mysql =="
docker compose -f "$compose_file" up -d --wait mysql

# Root credentials: the contract harness isolates each test file in its own
# database (MySQL has no per-schema search_path), which needs CREATE/DROP DATABASE.
export KAWAII_WIKI_TEST_MYSQL_URL="mysql://root:wiki@127.0.0.1:13306/wiki"

echo "== mysql contract: db/mysql =="
# Run each contract file on its own: every file provisions its own isolated
# database (35 tables), and doing that for all files at once serialises MySQL's
# DDL and starves the per-file setup timeout. One file at a time keeps each
# setup fast and the whole run stable as more files are added.
for file in apps/server/src/db/mysql/*.test.ts; do
  echo "-- $file --"
  bun test "$file"
done
