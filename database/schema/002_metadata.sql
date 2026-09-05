-- ============================================================
-- 002_metadata.sql
-- Metadata Management: Platform metadata from Snowflake, Redshift, etc.
-- Extensible via platform_id discriminator — no schema changes for new platforms
-- ============================================================

-- ─── Platform Registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_platforms (
    platform_id         SERIAL PRIMARY KEY,
    platform_code       VARCHAR(50)  NOT NULL UNIQUE,
    platform_name       VARCHAR(100) NOT NULL,
    platform_version    VARCHAR(50),
    connection_alias    VARCHAR(100),
    account_identifier  VARCHAR(255),
    warehouse           VARCHAR(100),
    default_database    VARCHAR(100),
    role_name           VARCHAR(100),
    host                VARCHAR(255),
    port                INTEGER,
    http_path           VARCHAR(255),
    catalog_name        VARCHAR(100),
    db_user             VARCHAR(100),
    db_password         VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    connection_status   VARCHAR(30) NOT NULL DEFAULT 'UNTESTED'
                        CHECK (connection_status IN ('CONNECTED', 'FAILED', 'UNTESTED')),
    last_tested_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Databases ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_databases (
    database_id         SERIAL PRIMARY KEY,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id) ON DELETE CASCADE,
    database_name       VARCHAR(255) NOT NULL,
    database_owner      VARCHAR(255),
    is_transient        BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(platform_id, database_name)
);

-- ─── Schemas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_schemas (
    schema_id           SERIAL PRIMARY KEY,
    database_id         INTEGER NOT NULL REFERENCES metadata_databases(database_id) ON DELETE CASCADE,
    schema_name         VARCHAR(255) NOT NULL,
    schema_owner        VARCHAR(255),
    is_managed_access   BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(database_id, schema_name)
);

-- ─── Tables / Views ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_tables (
    table_id            SERIAL PRIMARY KEY,
    schema_id           INTEGER NOT NULL REFERENCES metadata_schemas(schema_id) ON DELETE CASCADE,
    table_name          VARCHAR(255) NOT NULL,
    table_type          VARCHAR(50)  NOT NULL
                        CHECK (table_type IN ('TABLE','VIEW','MATERIALIZED_VIEW','EXTERNAL_TABLE','STREAM','DYNAMIC_TABLE')),
    table_owner         VARCHAR(255),
    row_count_estimate  BIGINT,
    bytes_estimate      BIGINT,
    clustering_keys     VARCHAR(500),
    is_transient        BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_altered_source TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(schema_id, table_name)
);

-- ─── Columns ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_columns (
    column_id           SERIAL PRIMARY KEY,
    table_id            INTEGER NOT NULL REFERENCES metadata_tables(table_id) ON DELETE CASCADE,
    column_name         VARCHAR(255) NOT NULL,
    ordinal_position    INTEGER      NOT NULL,
    data_type           VARCHAR(100) NOT NULL,
    normalized_type     VARCHAR(50)  NOT NULL
                        CHECK (normalized_type IN ('TEXT','NUMBER','BOOLEAN','DATE','TIMESTAMP','BINARY','VARIANT','GEOMETRY')),
    character_max_length INTEGER,
    numeric_precision   INTEGER,
    numeric_scale       INTEGER,
    is_nullable         BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary_key      BOOLEAN NOT NULL DEFAULT FALSE,
    default_value       VARCHAR(500),
    comment_text        TEXT,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(table_id, column_name)
);

-- ─── Tags (Hierarchical Taxonomy) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_tags (
    tag_id              SERIAL PRIMARY KEY,
    platform_id         INTEGER REFERENCES metadata_platforms(platform_id) ON DELETE CASCADE,
    tag_name            VARCHAR(255) NOT NULL,
    full_path           VARCHAR(500) NOT NULL UNIQUE,
    parent_tag_id       INTEGER REFERENCES metadata_tags(tag_id) ON DELETE CASCADE,
    tag_category        VARCHAR(100),
    source_type         VARCHAR(50) NOT NULL DEFAULT 'MANUAL'
                        CHECK (source_type IN ('MANUAL','DISCOVERED','AUTOMATED_DISCOVERY','EXTERNAL_CATALOG','SYSTEM')),
    description         TEXT,
    allowed_values      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tag Assignments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_tag_assignments (
    assignment_id       SERIAL PRIMARY KEY,
    tag_id              INTEGER NOT NULL REFERENCES metadata_tags(tag_id) ON DELETE CASCADE,
    table_id            INTEGER REFERENCES metadata_tables(table_id) ON DELETE CASCADE,
    column_id           INTEGER REFERENCES metadata_columns(column_id) ON DELETE CASCADE,
    tag_value           VARCHAR(255),
    confidence_score    DOUBLE PRECISION DEFAULT 1.0,
    assigned_by         VARCHAR(100) DEFAULT 'SYSTEM',
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at_source  TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (table_id IS NOT NULL OR column_id IS NOT NULL)
);


-- ─── Data Product ↔ Table Mappings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_product_table_mappings (
    mapping_id          SERIAL PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES data_products(product_id) ON DELETE CASCADE,
    table_id            INTEGER NOT NULL REFERENCES metadata_tables(table_id) ON DELETE CASCADE,
    is_primary_table    BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(product_id, table_id)
);

-- ─── Platform Role Mappings (internal role ↔ platform-native role) ────────────
CREATE TABLE IF NOT EXISTS platform_role_mappings (
    mapping_id          SERIAL PRIMARY KEY,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id) ON DELETE CASCADE,
    internal_role_id    INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    platform_role_name  VARCHAR(255) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(platform_id, internal_role_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meta_db_platform     ON metadata_databases(platform_id);
CREATE INDEX IF NOT EXISTS idx_meta_schema_db       ON metadata_schemas(database_id);
CREATE INDEX IF NOT EXISTS idx_meta_table_schema    ON metadata_tables(schema_id);
CREATE INDEX IF NOT EXISTS idx_meta_col_table       ON metadata_columns(table_id);
CREATE INDEX IF NOT EXISTS idx_meta_tag_assign_col  ON metadata_tag_assignments(column_id);
CREATE INDEX IF NOT EXISTS idx_meta_tag_assign_tbl  ON metadata_tag_assignments(table_id);

-- ─── Platform Drivers Registry (Extensible Multi-Cloud Drivers) ───────────────
CREATE TABLE IF NOT EXISTS metadata_platform_drivers (
    driver_code         VARCHAR(50)  PRIMARY KEY,
    driver_name         VARCHAR(100) NOT NULL,
    description         TEXT,
    fields              JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Automated Tag Discovery Identifiers & Rules ──────────────────────────────
CREATE TABLE IF NOT EXISTS metadata_tag_rules (
    rule_id             SERIAL PRIMARY KEY,
    tag_path            VARCHAR(255) NOT NULL UNIQUE,
    category            VARCHAR(50)  NOT NULL,
    regex_pattern       VARCHAR(500) NOT NULL,
    description         TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Celery Task Execution History (Beat Cron & Worker Runs) ─────────────────
CREATE TABLE IF NOT EXISTS celery_task_history (
    id                  SERIAL PRIMARY KEY,
    task_id             VARCHAR(255) NOT NULL,
    task_name           VARCHAR(255) NOT NULL,
    task_type           VARCHAR(50)  NOT NULL DEFAULT 'CRON_BEAT'
                        CHECK (task_type IN ('CRON_BEAT', 'POLICY_DEPLOYMENT', 'MANUAL_SYNC')),
    platform_code       VARCHAR(50),
    status              VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE')),
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    duration_ms         INTEGER,
    tables_synced       INTEGER      DEFAULT 0,
    columns_synced      INTEGER      DEFAULT 0,
    result_summary      TEXT,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_celery_task_history_type    ON celery_task_history(task_type);
CREATE INDEX IF NOT EXISTS idx_celery_task_history_started ON celery_task_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_celery_task_history_status  ON celery_task_history(status);

