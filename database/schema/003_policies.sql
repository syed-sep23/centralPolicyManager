-- ============================================================
-- 003_policies.sql
-- Policy Storage: Fully normalized, no JSONB
-- Policies, Versions, Rules, Subjects, Resources, Actions, Conditions
-- ============================================================

-- ─── ABAC Attribute Groups (referenced before policy tables) ──────────────────
CREATE TABLE IF NOT EXISTS abac_attribute_groups (
    group_id            SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    group_name          VARCHAR(255) NOT NULL,
    group_description   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS abac_attribute_group_members (
    member_id           SERIAL PRIMARY KEY,
    group_id            INTEGER NOT NULL REFERENCES abac_attribute_groups(group_id) ON DELETE CASCADE,
    attribute_key       VARCHAR(100) NOT NULL,
    operator            VARCHAR(30)  NOT NULL
                        CHECK (operator IN ('EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS','REGEX')),
    compare_value       VARCHAR(500) NOT NULL,
    UNIQUE(group_id, attribute_key)
);

-- ─── Policies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
    policy_id           SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    policy_name         VARCHAR(255) NOT NULL,
    policy_code         VARCHAR(100) NOT NULL,
    description         TEXT,
    domain_id           INTEGER REFERENCES data_domains(domain_id) ON DELETE SET NULL,
    product_id          INTEGER REFERENCES data_products(product_id) ON DELETE SET NULL,
    owner_user_id       INTEGER NOT NULL REFERENCES users(user_id),
    enforce_mode        VARCHAR(20) NOT NULL DEFAULT 'ADVISORY'
                        CHECK (enforce_mode IN ('ADVISORY','ENFORCED')),
    current_version_id  INTEGER,   -- FK added after policy_versions table
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','VALIDATED','FAILED_VALIDATION','DEPLOYING','ENFORCED','DEPRECATED','ROLLBACK')),
    effective_date      DATE,
    expiry_date         DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, policy_code)
);

-- ─── Policy Versions (immutable snapshots) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_versions (
    version_id          SERIAL PRIMARY KEY,
    policy_id           INTEGER NOT NULL REFERENCES policies(policy_id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    version_label       VARCHAR(50),
    is_current          BOOLEAN NOT NULL DEFAULT FALSE,
    authored_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
    reviewed_by_user_id INTEGER REFERENCES users(user_id),
    approved_by_user_id INTEGER REFERENCES users(user_id),
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','DEPLOYED','ROLLED_BACK')),
    change_summary      TEXT,
    opa_rego_hash       VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deployed_at         TIMESTAMPTZ,
    rolled_back_at      TIMESTAMPTZ,
    UNIQUE(policy_id, version_number)
);

-- ─── Add FK from policies → policy_versions (deferred to handle circular ref) ─
ALTER TABLE policies ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id)
    REFERENCES policy_versions(version_id)
    DEFERRABLE INITIALLY DEFERRED;

-- ─── Policy Rules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rules (
    rule_id             SERIAL PRIMARY KEY,
    version_id          INTEGER NOT NULL REFERENCES policy_versions(version_id) ON DELETE CASCADE,
    rule_name           VARCHAR(255) NOT NULL,
    rule_description    TEXT,
    rule_order          INTEGER NOT NULL DEFAULT 0,
    rule_type           VARCHAR(50)  NOT NULL
                        CHECK (rule_type IN ('RBAC','ABAC','COMBINED')),
    effect              VARCHAR(10)  NOT NULL
                        CHECK (effect IN ('ALLOW','DENY')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Rule Subjects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_subjects (
    subject_id          SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id) ON DELETE CASCADE,
    subject_type        VARCHAR(30)  NOT NULL
                        CHECK (subject_type IN ('ROLE','USER','ABAC_GROUP','ANY')),
    role_id             INTEGER REFERENCES roles(role_id),
    user_id             INTEGER REFERENCES users(user_id),
    abac_group_id       INTEGER REFERENCES abac_attribute_groups(group_id),
    CONSTRAINT chk_subject_ref CHECK (
        (subject_type = 'ROLE'       AND role_id       IS NOT NULL AND user_id IS NULL    AND abac_group_id IS NULL) OR
        (subject_type = 'USER'       AND user_id        IS NOT NULL AND role_id IS NULL    AND abac_group_id IS NULL) OR
        (subject_type = 'ABAC_GROUP' AND abac_group_id  IS NOT NULL AND role_id IS NULL    AND user_id IS NULL) OR
        (subject_type = 'ANY'        AND role_id IS NULL            AND user_id IS NULL    AND abac_group_id IS NULL)
    )
);

-- ─── Rule Resources ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_resources (
    resource_id         SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id) ON DELETE CASCADE,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    database_id         INTEGER REFERENCES metadata_databases(database_id),
    schema_id           INTEGER REFERENCES metadata_schemas(schema_id),
    table_id            INTEGER REFERENCES metadata_tables(table_id),
    resource_scope      VARCHAR(30) NOT NULL
                        CHECK (resource_scope IN ('DATABASE','SCHEMA','TABLE','COLUMN','TAG'))
);

-- ─── Column-Level Resource Scoping ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_resource_columns (
    id                  SERIAL PRIMARY KEY,
    resource_id         INTEGER NOT NULL REFERENCES policy_rule_resources(resource_id) ON DELETE CASCADE,
    column_id           INTEGER NOT NULL REFERENCES metadata_columns(column_id),
    UNIQUE(resource_id, column_id)
);

-- ─── Tag-Level Resource Scoping ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_resource_tags (
    id                  SERIAL PRIMARY KEY,
    resource_id         INTEGER NOT NULL REFERENCES policy_rule_resources(resource_id) ON DELETE CASCADE,
    tag_id              INTEGER NOT NULL REFERENCES metadata_tags(tag_id),
    tag_value           VARCHAR(255),
    UNIQUE(resource_id, tag_id, tag_value)
);

-- ─── Rule Actions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_actions (
    action_id           SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id) ON DELETE CASCADE,
    action_type         VARCHAR(50)  NOT NULL
                        CHECK (action_type IN ('GRANT_SELECT','GRANT_INSERT','GRANT_UPDATE','DENY_ACCESS','MASK_COLUMN','FILTER_ROWS','AUDIT_LOG')),
    mask_type           VARCHAR(50)
                        CHECK (mask_type IN ('NULL_MASK','HASH_SHA256','PARTIAL_MASK','EMAIL_MASK','PHONE_MASK','CUSTOM')),
    mask_expression     TEXT,
    filter_column       VARCHAR(255),
    filter_operator     VARCHAR(20)
                        CHECK (filter_operator IN ('EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS')),
    filter_value_type   VARCHAR(30)
                        CHECK (filter_value_type IN ('LITERAL','USER_ATTRIBUTE','SESSION_CONTEXT')),
    filter_value        VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Rule ABAC Conditions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_rule_conditions (
    condition_id        SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id) ON DELETE CASCADE,
    condition_group     INTEGER NOT NULL DEFAULT 1,
    attribute_type      VARCHAR(30)  NOT NULL
                        CHECK (attribute_type IN ('USER_ATTRIBUTE','RESOURCE_ATTRIBUTE','ENV_ATTRIBUTE','SESSION_ATTRIBUTE')),
    attribute_key       VARCHAR(100) NOT NULL,
    operator            VARCHAR(30)  NOT NULL
                        CHECK (operator IN ('EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS','REGEX','IS_NULL','IS_NOT_NULL')),
    compare_value_type  VARCHAR(30)  NOT NULL
                        CHECK (compare_value_type IN ('LITERAL','ATTRIBUTE_REF')),
    compare_value       VARCHAR(500),
    is_negated          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Platform Deployment Targets per Version ──────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_version_targets (
    target_id           SERIAL PRIMARY KEY,
    version_id          INTEGER NOT NULL REFERENCES policy_versions(version_id) ON DELETE CASCADE,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    deployment_status   VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (deployment_status IN ('PENDING','IN_PROGRESS','SUCCESS','FAILED','ROLLED_BACK')),
    temporal_workflow_id VARCHAR(255),
    deployed_at         TIMESTAMPTZ,
    error_message       TEXT,
    UNIQUE(version_id, platform_id)
);

-- ─── Audit Events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
    event_id            BIGSERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    event_type          VARCHAR(100) NOT NULL,
    event_timestamp     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actor_user_id       INTEGER REFERENCES users(user_id),
    actor_service       VARCHAR(100),
    policy_id           INTEGER REFERENCES policies(policy_id),
    policy_version_id   INTEGER REFERENCES policy_versions(version_id),
    platform_id         INTEGER REFERENCES metadata_platforms(platform_id),
    resource_path       VARCHAR(1000),
    outcome             VARCHAR(20)  NOT NULL
                        CHECK (outcome IN ('SUCCESS','FAILURE','ADVISORY')),
    detail_text         TEXT
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_policies_org             ON policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_policies_status          ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy   ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_rules_version     ON policy_rules(version_id);
CREATE INDEX IF NOT EXISTS idx_rule_subjects_rule       ON policy_rule_subjects(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_resources_rule      ON policy_rule_resources(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_actions_rule        ON policy_rule_actions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_conditions_rule     ON policy_rule_conditions(rule_id);
CREATE INDEX IF NOT EXISTS idx_pvt_version              ON policy_version_targets(version_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp          ON audit_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_policy             ON audit_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor              ON audit_events(actor_user_id);
