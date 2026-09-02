#!/bin/sh
set -eu

echo "=============================================="
echo "  Temporal Schema Migration"
echo "=============================================="

SQL_PLUGIN="postgres12"
SQL_HOST="${POSTGRES_HOST:-postgresql}"
SQL_PORT="${POSTGRES_PORT:-5432}"
SQL_USER="${TEMPORAL_PG_USER:-temporal_user}"
SQL_PWD="${TEMPORAL_PG_PASSWORD:-temporal_secret_2024}"

# --- Main database schema ---
echo "[1/4] Initializing 'temporal' base schema..."
temporal-sql-tool \
  --plugin "$SQL_PLUGIN" --ep "$SQL_HOST" -p "$SQL_PORT" \
  -u "$SQL_USER" --pw "$SQL_PWD" \
  --db temporal \
  setup-schema -v 0.0 2>/dev/null \
  && echo "  -> Base schema created" \
  || echo "  -> Base schema already initialized (skipped)"

echo "[2/4] Applying 'temporal' versioned migrations..."
temporal-sql-tool \
  --plugin "$SQL_PLUGIN" --ep "$SQL_HOST" -p "$SQL_PORT" \
  -u "$SQL_USER" --pw "$SQL_PWD" \
  --db temporal \
  update-schema -d /etc/temporal/schema/postgresql/v12/temporal/versioned
echo "  -> Migrations applied"

# --- Visibility database schema ---
echo "[3/4] Initializing 'temporal_visibility' base schema..."
temporal-sql-tool \
  --plugin "$SQL_PLUGIN" --ep "$SQL_HOST" -p "$SQL_PORT" \
  -u "$SQL_USER" --pw "$SQL_PWD" \
  --db temporal_visibility \
  setup-schema -v 0.0 2>/dev/null \
  && echo "  -> Base schema created" \
  || echo "  -> Base schema already initialized (skipped)"

echo "[4/4] Applying 'temporal_visibility' versioned migrations..."
temporal-sql-tool \
  --plugin "$SQL_PLUGIN" --ep "$SQL_HOST" -p "$SQL_PORT" \
  -u "$SQL_USER" --pw "$SQL_PWD" \
  --db temporal_visibility \
  update-schema -d /etc/temporal/schema/postgresql/v12/visibility/versioned
echo "  -> Migrations applied"

echo "=============================================="
echo "  Schema migration complete"
echo "=============================================="
