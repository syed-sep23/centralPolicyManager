-- ============================================================
-- 001_core_domain.sql
-- Core Domain Data: Organizations, Domains, Products, Users, Roles
-- Source: LDAP-synchronized (read-mostly)
-- ============================================================

-- ─── Organizations / Tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    organization_id     SERIAL PRIMARY KEY,
    org_name            VARCHAR(255) NOT NULL UNIQUE,
    org_code            VARCHAR(50)  NOT NULL UNIQUE,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Data Domains ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_domains (
    domain_id           SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    domain_name         VARCHAR(255) NOT NULL,
    domain_code         VARCHAR(50)  NOT NULL,
    description         TEXT,
    domain_owner_ldap   VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, domain_code)
);

-- ─── Data Products ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_products (
    product_id          SERIAL PRIMARY KEY,
    domain_id           INTEGER NOT NULL REFERENCES data_domains(domain_id) ON DELETE CASCADE,
    product_name        VARCHAR(255) NOT NULL,
    product_code        VARCHAR(50)  NOT NULL,
    description         TEXT,
    product_owner_ldap  VARCHAR(255),
    sensitivity_level   VARCHAR(50)  NOT NULL DEFAULT 'INTERNAL'
                        CHECK (sensitivity_level IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TOP_SECRET')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_id, product_code)
);

-- ─── Roles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    role_id             SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    role_name           VARCHAR(255) NOT NULL,
    role_code           VARCHAR(100) NOT NULL,
    description         TEXT,
    ldap_group_dn       VARCHAR(500),
    parent_role_id      INTEGER REFERENCES roles(role_id) ON DELETE SET NULL,
    is_system_role      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, role_code)
);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id             SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    username            VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    display_name        VARCHAR(255),
    ldap_dn             VARCHAR(500),
    department          VARCHAR(255),
    job_title           VARCHAR(255),
    cost_center         VARCHAR(100),
    office_location     VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, username),
    UNIQUE(organization_id, email)
);

-- ─── User-Role Mappings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_role_mappings (
    mapping_id          SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id             INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    granted_by_user_id  INTEGER REFERENCES users(user_id),
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- ─── User ABAC Attributes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_attributes (
    attribute_id        SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    attribute_key       VARCHAR(100) NOT NULL,
    attribute_value     VARCHAR(500) NOT NULL,
    attribute_source    VARCHAR(50)  NOT NULL DEFAULT 'LDAP'
                        CHECK (attribute_source IN ('LDAP','MANUAL','SYSTEM')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, attribute_key)
);

-- ─── Domain-Product Cross-Domain Relationships ────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_product_dependencies (
    dependency_id       SERIAL PRIMARY KEY,
    source_product_id   INTEGER NOT NULL REFERENCES data_products(product_id) ON DELETE CASCADE,
    target_product_id   INTEGER NOT NULL REFERENCES data_products(product_id) ON DELETE CASCADE,
    dependency_type     VARCHAR(100) NOT NULL
                        CHECK (dependency_type IN ('UPSTREAM','DOWNSTREAM','RELATED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source_product_id <> target_product_id)
);

-- ─── Permissions (system-level) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
    permission_id       SERIAL PRIMARY KEY,
    permission_code     VARCHAR(100) NOT NULL UNIQUE,
    permission_name     VARCHAR(255) NOT NULL,
    resource_type       VARCHAR(50)  NOT NULL,  -- 'POLICY', 'DATA_PRODUCT', 'ROLE', 'METADATA'
    action              VARCHAR(50)  NOT NULL,  -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'DEPLOY'
    description         TEXT
);

-- ─── Role-Permission Mappings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    mapping_id          SERIAL PRIMARY KEY,
    role_id             INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id       INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_org         ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_roles_org         ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_urm_user          ON user_role_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_urm_role          ON user_role_mappings(role_id);
CREATE INDEX IF NOT EXISTS idx_user_attrs_user   ON user_attributes(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_org       ON data_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_domain   ON data_products(domain_id);
