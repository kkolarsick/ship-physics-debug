#!/usr/bin/env bash
# Apply every migration to a throwaway database and run the tenant-isolation suite.
#
# Usage: scripts/db-test.sh [connection-args...]
#   Defaults to the local cluster the repo's test setup starts on port 55432.
set -euo pipefail

PSQL_ARGS=("${@:-}")
if [ -z "${1:-}" ]; then
  PSQL_ARGS=(-h "${PGHOST:-/tmp}" -p "${PGPORT:-55432}" -U "${PGUSER:-postgres}")
fi

DB="subledger_test_$$"
psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB" -c "create database $DB"
trap 'psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

run() { psql "${PSQL_ARGS[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run supabase/test/harness.sql
for migration in supabase/migrations/*.sql; do
  echo "  applying $(basename "$migration")"
  run "$migration"
done
run supabase/test/grants.sql

echo "  running tenant isolation suite"
psql "${PSQL_ARGS[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/test/tenant-isolation.test.sql
