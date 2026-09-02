#!/bin/sh
set -eu

echo "=============================================="
echo "  Temporal Database Initialization"
echo "=============================================="

# Create dedicated Temporal user (idempotent)
echo "[1/5] Creating Temporal database user: $TEMPORAL_PG_USER"
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$TEMPORAL_PG_USER') THEN CREATE ROLE $TEMPORAL_PG_USER WITH LOGIN PASSWORD '$TEMPORAL_PG_PASSWORD'; RAISE NOTICE 'Role created'; ELSE RAISE NOTICE 'Role already exists'; END IF; END \$\$;"

# Create temporal database (idempotent)
echo "[2/5] Creating database: temporal"
DB_EXISTS=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='temporal'" || echo "0")
if [ "$DB_EXISTS" != "1" ]; then
  psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "CREATE DATABASE temporal OWNER $TEMPORAL_PG_USER;"
  echo "  -> Database 'temporal' created"
else
  echo "  -> Database 'temporal' already exists (skipped)"
fi

# Create temporal_visibility database (idempotent)
echo "[3/5] Creating database: temporal_visibility"
DB_EXISTS=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='temporal_visibility'" || echo "0")
if [ "$DB_EXISTS" != "1" ]; then
  psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "CREATE DATABASE temporal_visibility OWNER $TEMPORAL_PG_USER;"
  echo "  -> Database 'temporal_visibility' created"
else
  echo "  -> Database 'temporal_visibility' already exists (skipped)"
fi

# Grant schema privileges (required for PostgreSQL 15+ where public schema is restricted)
echo "[4/5] Granting privileges on temporal"
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d temporal -c "GRANT ALL ON SCHEMA public TO $TEMPORAL_PG_USER;" 2>/dev/null || true

echo "[5/5] Granting privileges on temporal_visibility"
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_SUPERUSER" -d temporal_visibility -c "GRANT ALL ON SCHEMA public TO $TEMPORAL_PG_USER;" 2>/dev/null || true

echo "=============================================="
echo "  Temporal databases ready"
echo "=============================================="
