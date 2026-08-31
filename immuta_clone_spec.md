# Open-Source Immuta Clone — Technical Specification & Implementation Guide

> **Version**: 1.0.0 | **Status**: POC Design | **Date**: 2026-08-30  
> **Audience**: Senior Engineers, Architects, DevOps Teams

---

## Table of Contents

1. [Architecture Comparison](#1-architecture-comparison)
2. [Policy Authoring and Enforcement Flow](#2-policy-authoring-and-enforcement-flow)
3. [Data Model and SQL Schema](#3-data-model-and-sql-schema)
4. [Microservices Architecture and Tech Stack](#4-microservices-architecture-and-tech-stack)
5. [RBAC and ABAC Implementation](#5-rbac-and-abac-implementation)
6. [Temporal Workflow Integration](#6-temporal-workflow-integration)
7. [Inter-Service Communication and Integration](#7-inter-service-communication-and-integration)
8. [Extensibility Strategy](#8-extensibility-strategy)
9. [Open-Source Technology Recommendations](#9-open-source-technology-recommendations)

---

## 1. Architecture Comparison

### 1.1 Actual Immuta Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          IMMUTA PLATFORM                                 │
│                                                                           │
│  ┌─────────────┐    ┌──────────────────────────────────────────────┐    │
│  │             │    │              POLICY ENGINE LAYER              │    │
│  │   IMMUTA    │───▶│  ┌──────────────┐  ┌─────────────────────┐  │    │
│  │   WEB UI    │    │  │ Policy Author│  │  Policy Validator   │  │    │
│  │  (React)    │    │  │  (GUI + API) │  │  (Built-in Engine)  │  │    │
│  │             │    │  └──────────────┘  └─────────────────────┘  │    │
│  └─────────────┘    └──────────────────────────────────────────────┘    │
│         │                              │                                  │
│         │           ┌──────────────────▼──────────────────────────┐      │
│         │           │           METADATA MANAGEMENT                │      │
│         │           │  ┌─────────────┐  ┌───────────────────────┐ │      │
│         │           │  │ Data Catalog│  │   Tag Management      │ │      │
│         └──────────▶│  │  (Internal) │  │   (Sensitivity Lvls)  │ │      │
│                     │  └─────────────┘  └───────────────────────┘ │      │
│                     └──────────────────────────────────────────────┘      │
│                                        │                                  │
│                     ┌──────────────────▼──────────────────────────┐      │
│                     │           ENFORCEMENT LAYER                  │      │
│                     │  ┌────────────┐  ┌───────────────────────┐  │      │
│                     │  │  Row-Level │  │   Column-Level Masking │  │      │
│                     │  │  Security  │  │   (Dynamic Masking)    │  │      │
│                     │  └────────────┘  └───────────────────────┘  │      │
│                     └──────────────────────────────────────────────┘      │
│                                        │                                  │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                     TARGET PLATFORMS                               │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  │ Snowflake  │  │  Redshift  │  │  Databricks│  │  BigQuery  │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Immuta Core Layers Explained:**
| Layer | Responsibility |
|---|---|
| **UI Layer** | React-based web app for policy authoring, data discovery, subscription |
| **Policy Engine** | Proprietary engine for policy compilation, versioning, conflict detection |
| **Metadata Management** | Internal catalog synced from source platforms; sensitivity tagging |
| **Enforcement Layer** | Pushes compiled policies as native platform constructs (row filters, masking policies, grants) |
| **Target Platforms** | Snowflake, Redshift, Databricks, Starburst, etc. — receive native policy enforcement |

---

### 1.2 Proposed Open-Source Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        OPEN-SOURCE IMMUTA CLONE — SYSTEM OVERVIEW                      │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          PRESENTATION LAYER                                      │   │
│  │  ┌────────────────────────────────────────────────────────────────────────┐     │   │
│  │  │  Frontend Service  (React 18 + Mantine UI v7 + TypeScript + Vite)      │     │   │
│  │  │  • Policy Studio   • Data Catalog Browser   • Audit Dashboard          │     │   │
│  │  │  • Role Manager    • Subscription Portal    • Monitoring               │     │   │
│  │  └────────────────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                              │  REST / HTTP (via API Gateway)                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          API GATEWAY LAYER  (Traefik)                           │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│      │              │              │              │               │                      │
│  ┌───▼──────┐  ┌────▼─────┐  ┌───▼──────┐  ┌───▼──────┐  ┌────▼──────┐              │
│  │  Policy  │  │  Policy  │  │ Metadata │  │User/RBAC │  │Enforcement│              │
│  │ Authoring│  │Validation│  │ Service  │  │ Service  │  │ Service   │              │
│  │ Service  │  │ Service  │  │          │  │          │  │(Temporal) │              │
│  │(FastAPI) │  │(FastAPI+ │  │(FastAPI) │  │(FastAPI) │  │           │              │
│  │          │  │  OPA)    │  │          │  │          │  │           │              │
│  └────┬─────┘  └─────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬────┘              │
│       │               │            │              │               │                      │
│  ┌────▼───────────────▼────────────▼──────────────▼───────────────▼────────────────┐   │
│  │                         DATA LAYER (PostgreSQL 16)                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │  Core Domain │  │   Metadata   │  │   Policies   │  │   Audit/Events   │    │   │
│  │  │   (LDAP-sync)│  │  (Snowflake/ │  │  (Rules,     │  │                  │    │   │
│  │  │  Users,Roles │  │  Redshift)   │  │   Versions)  │  │                  │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                     ORCHESTRATION LAYER (Temporal)                              │   │
│  │  ┌──────────────────────────────────────────────────────────────────────┐      │   │
│  │  │  PolicyDeploymentWorkflow → [Validate → PreCheck → Deploy → Verify]  │      │   │
│  │  └──────────────────────────────────────────────────────────────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                     PLATFORM CONNECTOR LAYER                                    │   │
│  │  ┌────────────────────┐              ┌────────────────────┐                     │   │
│  │  │  Snowflake         │              │  Redshift          │                     │   │
│  │  │  Connector         │              │  Connector         │                     │   │
│  │  │  (FastAPI)         │              │  (FastAPI)         │                     │   │
│  │  │  • Row filters     │              │  • RLS policies    │                     │   │
│  │  │  • Dynamic masking │              │  • Column masking  │                     │   │
│  │  │  • RBAC grants     │              │  • RBAC grants     │                     │   │
│  │  └────────────┬───────┘              └─────────┬──────────┘                     │   │
│  └───────────────┼────────────────────────────────┼────────────────────────────────┘   │
│                  │                                 │                                     │
│  ┌───────────────▼──────────────┐  ┌──────────────▼──────────────────┐                 │
│  │   Snowflake Data Warehouse   │  │   Amazon Redshift Cluster        │                 │
│  │   (Native enforcement:       │  │   (Native enforcement:           │                 │
│  │    row access policies,      │  │    RLS, column masking,          │                 │
│  │    masking policies, grants) │  │    grants managed independently) │                 │
│  └──────────────────────────────┘  └──────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.3 Side-by-Side Comparison

| Dimension | Immuta (Proprietary) | Open-Source Clone |
|---|---|---|
| **UI** | Proprietary React app | React 18 + Mantine UI v7 + TypeScript |
| **Policy Engine** | Closed, built-in engine | OPA (Open Policy Agent) — Rego language |
| **Metadata Catalog** | Internal catalog, auto-sync | PostgreSQL tables, sync jobs via FastAPI |
| **Auth/Identity** | SAML, LDAP (proprietary) | Keycloak (OIDC/SAML/LDAP) |
| **Workflow Orchestration** | Internal job scheduler | Temporal (open-source workflow engine) |
| **Enforcement** | Native platform drivers | Platform connectors (FastAPI services) |
| **Licensing** | Commercial | Apache 2.0 / MIT |
| **Extensibility** | Via Immuta SDK (paid) | Connector interface (open standard) |
| **Observability** | Proprietary dashboards | Prometheus + Grafana + Loki |
| **Audit** | Built-in audit trail | PostgreSQL audit tables + Loki logs |

---

## 2. Policy Authoring and Enforcement Flow

### 2.1 Complete End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                     POLICY AUTHORING AND ENFORCEMENT PIPELINE                        │
│                                                                                        │
│  [1] AUTHOR                                                                            │
│   React UI                                                                             │
│   ┌──────────────────────────────────────────────────────┐                            │
│   │  Policy Studio (Mantine UI)                           │                            │
│   │  • Select data domain / product                       │                            │
│   │  • Define RBAC rules (role → permission)              │                            │
│   │  • Define ABAC rules (attribute conditions)           │                            │
│   │  • Select target platforms (Snowflake, Redshift)      │                            │
│   │  • Set schedule / effective dates                     │                            │
│   └──────────────────────┬───────────────────────────────┘                            │
│                           │ POST /policies (draft)                                     │
│  [2] STORE DRAFT                                                                       │
│   Policy Authoring Service (FastAPI)                                                   │
│   ┌──────────────────────────────────────────────────────┐                            │
│   │  • Validate request schema (Pydantic V2)              │                            │
│   │  • Persist policy as status=DRAFT in PostgreSQL       │                            │
│   │  • Create version record (version=1, parent=null)     │                            │
│   │  • Return policy_id + version_id                      │                            │
│   └──────────────────────┬───────────────────────────────┘                            │
│                           │ POST /validate (internal)                                  │
│  [3] VALIDATE (OPA)                                                                    │
│   Policy Validation Service (FastAPI + OPA)                                            │
│   ┌──────────────────────────────────────────────────────┐                            │
│   │  • Translate policy DB rows → Rego document           │                            │
│   │  • Call OPA /v1/data/policy/validate endpoint         │                            │
│   │  • Check: conflict detection, completeness, syntax    │                            │
│   │  • Return: VALID | INVALID + error details            │                            │
│   │  • Update policy status: DRAFT → VALIDATED or FAILED  │                            │
│   └──────────────────────┬───────────────────────────────┘                            │
│                           │ Trigger Temporal workflow                                  │
│  [4] DEPLOY (Temporal Workflow)                                                        │
│   Enforcement Service + Temporal                                                       │
│   ┌──────────────────────────────────────────────────────┐                            │
│   │  PolicyDeploymentWorkflow:                            │                            │
│   │  Step 1: ValidateActivity    — re-validate with OPA   │                            │
│   │  Step 2: PreCheckActivity    — check platform health  │                            │
│   │  Step 3: SnowflakeActivity   — push to Snowflake      │                            │
│   │  Step 4: RedshiftActivity    — push to Redshift       │                            │
│   │  Step 5: VerifyActivity      — confirm enforcement    │                            │
│   │  On failure: RollbackActivity — revert to prior state │                            │
│   └──────────────────────┬───────────────────────────────┘                            │
│                           │                                                            │
│  [5] PLATFORM ENFORCEMENT (Independent after push)                                    │
│   Snowflake Connector / Redshift Connector                                             │
│   ┌──────────────────────────────────────────────────────┐                            │
│   │  Snowflake:                                           │                            │
│   │  • CREATE ROW ACCESS POLICY <name> ...               │                            │
│   │  • ALTER TABLE <t> ADD ROW ACCESS POLICY <name> ON   │                            │
│   │  • CREATE MASKING POLICY <name> ...                   │                            │
│   │  • GRANT SELECT ON ... TO ROLE <r>                    │                            │
│   │                                                        │                            │
│   │  Redshift:                                            │                            │
│   │  • CREATE RLS POLICY <name> ON <table> ...            │                            │
│   │  • ATTACH RLS POLICY <name> ON <table> TO ROLE <r>   │                            │
│   │  • GRANT SELECT ON ... TO <user/group>                │                            │
│   └──────────────────────────────────────────────────────┘                            │
│                                                                                        │
│  [6] STATUS UPDATE                                                                     │
│   • Policy status updated: VALIDATED → DEPLOYING → ENFORCED                           │
│   • Audit event written to audit_events table                                          │
│   • UI notified via polling / WebSocket                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Policy Versioning, Validation, and Rollback

**Versioning Strategy:**
- Every policy mutation creates a new immutable version row
- Version numbering: `major.minor` stored as integer pair in `policy_versions` table
- `is_current` flag marks the active version; only one version per policy can be current
- Previous versions remain queryable for audit

**Rollback Process:**
1. User initiates rollback via UI → `POST /policies/{id}/rollback?to_version={v}`
2. Policy Authoring Service sets previous version's `is_current = true`
3. A new Temporal workflow triggers to re-deploy the previous version's rules
4. Current enforced constructs on target platforms are replaced by prior version's constructs
5. Audit event logged: `ROLLBACK` with `from_version` and `to_version`

**Validation Gates:**
- **Gate 1 (Schema):** Pydantic V2 model validation on API ingestion
- **Gate 2 (Semantic):** OPA Rego evaluation for conflict detection, completeness
- **Gate 3 (Pre-deploy):** Platform connectivity check, target objects existence check
- **Gate 4 (Post-deploy):** Query platform to verify policies applied correctly

---

### 2.3 Policy Schema — Supported Attributes, Conditions, and Actions

```
Policy {
  identity:
    - name, description, owner, data_domain, data_product
    - effective_date, expiry_date, status, version

  subjects:
    - subject_type: ROLE | USER | ATTRIBUTE_GROUP
    - subject_reference: role_id | user_id | abac_group_id

  resources:
    - platform: SNOWFLAKE | REDSHIFT | BIGQUERY | DATABRICKS
    - database, schema, table, columns[]
    - tags[] (for attribute-based resource selection)

  conditions (ABAC):
    - attribute_type: USER_ATTRIBUTE | RESOURCE_ATTRIBUTE | ENV_ATTRIBUTE
    - attribute_key: e.g., "department", "clearance_level", "data_sensitivity"
    - operator: EQ | NEQ | IN | NOT_IN | GT | LT | CONTAINS | REGEX
    - attribute_value: string | number | list

  actions:
    - action_type: GRANT_ACCESS | DENY_ACCESS | MASK_COLUMN | FILTER_ROWS
    - mask_type: NULL | HASH | PARTIAL | CUSTOM_EXPRESSION
    - filter_expression: e.g., "region = current_user_attribute('region')"

  enforcement:
    - target_platform_ids[]
    - enforce_mode: ADVISORY | ENFORCED
}
```

---

## 3. Data Model and SQL Schema

### Part A: Core Domain Data (LDAP-Sourced)

```sql
-- ============================================================
-- PART A: CORE DOMAIN DATA (LDAP-synchronized, read-mostly)
-- ============================================================

-- Organizations / Tenants
CREATE TABLE organizations (
    organization_id     SERIAL PRIMARY KEY,
    org_name            VARCHAR(255) NOT NULL UNIQUE,
    org_code            VARCHAR(50)  NOT NULL UNIQUE,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data Domains (e.g., Finance, HR, Marketing)
CREATE TABLE data_domains (
    domain_id           SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    domain_name         VARCHAR(255) NOT NULL,
    domain_code         VARCHAR(50)  NOT NULL,
    description         TEXT,
    domain_owner_ldap   VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, domain_code)
);

-- Data Products (e.g., Customer 360, Revenue Analytics)
CREATE TABLE data_products (
    product_id          SERIAL PRIMARY KEY,
    domain_id           INTEGER NOT NULL REFERENCES data_domains(domain_id),
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

-- Roles (synchronized from LDAP groups)
CREATE TABLE roles (
    role_id             SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    role_name           VARCHAR(255) NOT NULL,
    role_code           VARCHAR(100) NOT NULL,
    description         TEXT,
    ldap_group_dn       VARCHAR(500),
    parent_role_id      INTEGER REFERENCES roles(role_id),  -- role hierarchy
    is_system_role      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, role_code)
);

-- Users (synchronized from LDAP)
CREATE TABLE users (
    user_id             SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
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

-- User-Role Mappings
CREATE TABLE user_role_mappings (
    mapping_id          SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(user_id),
    role_id             INTEGER NOT NULL REFERENCES roles(role_id),
    granted_by_user_id  INTEGER REFERENCES users(user_id),
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- User ABAC Attributes (user-level attribute key-value store, normalized)
CREATE TABLE user_attributes (
    attribute_id        SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(user_id),
    attribute_key       VARCHAR(100) NOT NULL,
    attribute_value     VARCHAR(500) NOT NULL,
    attribute_source    VARCHAR(50)  NOT NULL DEFAULT 'LDAP'
                        CHECK (attribute_source IN ('LDAP','MANUAL','SYSTEM')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, attribute_key)
);

-- Domain-Product cross-domain relationships
CREATE TABLE domain_product_dependencies (
    dependency_id       SERIAL PRIMARY KEY,
    source_product_id   INTEGER NOT NULL REFERENCES data_products(product_id),
    target_product_id   INTEGER NOT NULL REFERENCES data_products(product_id),
    dependency_type     VARCHAR(100) NOT NULL CHECK (dependency_type IN ('UPSTREAM','DOWNSTREAM','RELATED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source_product_id <> target_product_id)
);

-- ============================================================
-- SAMPLE DATA — PART A
-- ============================================================

INSERT INTO organizations (org_name, org_code, description) VALUES
('Acme Corporation', 'ACME', 'Global retail and e-commerce company');

INSERT INTO data_domains (organization_id, domain_name, domain_code, description, domain_owner_ldap) VALUES
(1, 'Finance',          'FINANCE',    'Financial data and reporting',          'cn=alice.chen,ou=finance,dc=acme,dc=com'),
(1, 'Human Resources',  'HR',         'Employee and workforce data',            'cn=bob.smith,ou=hr,dc=acme,dc=com'),
(1, 'Marketing',        'MARKETING',  'Customer and campaign analytics',        'cn=carol.jones,ou=marketing,dc=acme,dc=com'),
(1, 'Operations',       'OPS',        'Supply chain and logistics data',        'cn=dave.lee,ou=ops,dc=acme,dc=com');

INSERT INTO data_products (domain_id, product_name, product_code, description, product_owner_ldap, sensitivity_level) VALUES
(1, 'Revenue Analytics',      'REV_ANALYTICS',  'Monthly and quarterly revenue reporting',       'cn=alice.chen,ou=finance,dc=acme,dc=com', 'CONFIDENTIAL'),
(1, 'GL Transactions',        'GL_TRANS',        'General Ledger transaction records',            'cn=alice.chen,ou=finance,dc=acme,dc=com', 'RESTRICTED'),
(2, 'Employee Directory',     'EMP_DIR',         'Employee contact and org chart data',           'cn=bob.smith,ou=hr,dc=acme,dc=com',       'INTERNAL'),
(2, 'Compensation Data',      'COMP_DATA',       'Salary, bonus, and equity information',         'cn=bob.smith,ou=hr,dc=acme,dc=com',       'TOP_SECRET'),
(3, 'Customer 360',           'CUST_360',        'Unified customer profile and history',          'cn=carol.jones,ou=marketing,dc=acme,dc=com','CONFIDENTIAL'),
(3, 'Campaign Performance',   'CAMP_PERF',       'Marketing campaign results and ROI',            'cn=carol.jones,ou=marketing,dc=acme,dc=com','INTERNAL'),
(4, 'Inventory Management',   'INVENTORY',       'SKU-level inventory and warehouse data',        'cn=dave.lee,ou=ops,dc=acme,dc=com',       'INTERNAL'),
(4, 'Supplier Contracts',     'SUPPLIER_CONTR',  'Supplier agreement and pricing terms',          'cn=dave.lee,ou=ops,dc=acme,dc=com',       'RESTRICTED');

INSERT INTO roles (organization_id, role_name, role_code, description, ldap_group_dn, parent_role_id) VALUES
(1, 'Data Viewer',          'DATA_VIEWER',     'Read-only access to approved data products',  'cn=data-viewers,ou=groups,dc=acme,dc=com',  NULL),
(1, 'Data Analyst',         'DATA_ANALYST',    'Analytical access to internal/confidential',  'cn=data-analysts,ou=groups,dc=acme,dc=com', 1),
(1, 'Data Engineer',        'DATA_ENGINEER',   'ETL and pipeline development access',         'cn=data-engineers,ou=groups,dc=acme,dc=com',2),
(1, 'Policy Author',        'POLICY_AUTHOR',   'Can author and submit policies',              'cn=policy-authors,ou=groups,dc=acme,dc=com',NULL),
(1, 'Policy Admin',         'POLICY_ADMIN',    'Can approve, deploy, rollback policies',     'cn=policy-admins,ou=groups,dc=acme,dc=com', 4),
(1, 'Finance Analyst',      'FINANCE_ANALYST', 'Inherits Data Analyst + Finance domain',     'cn=finance-analysts,ou=groups,dc=acme,dc=com',2),
(1, 'HR Analyst',           'HR_ANALYST',      'Inherits Data Analyst + HR domain access',  'cn=hr-analysts,ou=groups,dc=acme,dc=com',   2),
(1, 'Super Admin',          'SUPER_ADMIN',     'Platform super administrator',               'cn=super-admins,ou=groups,dc=acme,dc=com',  5);

INSERT INTO users (organization_id, username, email, display_name, ldap_dn, department, job_title, cost_center, office_location) VALUES
(1, 'alice.chen',   'alice.chen@acme.com',   'Alice Chen',    'cn=alice.chen,ou=finance,dc=acme,dc=com',    'Finance',    'Finance Director',      'CC-001', 'New York'),
(1, 'bob.smith',    'bob.smith@acme.com',    'Bob Smith',     'cn=bob.smith,ou=hr,dc=acme,dc=com',           'HR',         'HR Manager',            'CC-002', 'Chicago'),
(1, 'carol.jones',  'carol.jones@acme.com',  'Carol Jones',   'cn=carol.jones,ou=marketing,dc=acme,dc=com', 'Marketing',  'Marketing Director',    'CC-003', 'San Francisco'),
(1, 'dave.lee',     'dave.lee@acme.com',     'Dave Lee',      'cn=dave.lee,ou=ops,dc=acme,dc=com',          'Operations', 'VP Operations',         'CC-004', 'Chicago'),
(1, 'eve.taylor',   'eve.taylor@acme.com',   'Eve Taylor',    'cn=eve.taylor,ou=finance,dc=acme,dc=com',    'Finance',    'Senior Financial Analyst','CC-001','New York'),
(1, 'frank.nguyen', 'frank.nguyen@acme.com', 'Frank Nguyen',  'cn=frank.nguyen,ou=eng,dc=acme,dc=com',      'Engineering','Data Engineer',          'CC-005','Austin'),
(1, 'grace.kim',    'grace.kim@acme.com',    'Grace Kim',     'cn=grace.kim,ou=marketing,dc=acme,dc=com',   'Marketing',  'Data Analyst',           'CC-003','San Francisco'),
(1, 'henry.wu',     'henry.wu@acme.com',     'Henry Wu',      'cn=henry.wu,ou=hr,dc=acme,dc=com',           'HR',         'HR Analyst',             'CC-002','Chicago');

INSERT INTO user_role_mappings (user_id, role_id, granted_by_user_id) VALUES
(1, 6, 8), -- alice.chen → Finance Analyst (granted by super admin)
(1, 4, 8), -- alice.chen → Policy Author
(2, 7, 8), -- bob.smith  → HR Analyst
(3, 2, 8), -- carol.jones → Data Analyst
(4, 2, 8), -- dave.lee → Data Analyst
(5, 6, 1), -- eve.taylor → Finance Analyst
(6, 3, 8), -- frank.nguyen → Data Engineer
(7, 2, 8), -- grace.kim → Data Analyst
(8, 7, 2), -- henry.wu → HR Analyst
(8, 4, 8); -- henry.wu → Policy Author

INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source) VALUES
(1, 'clearance_level',  'L4',           'LDAP'),
(1, 'department',       'Finance',      'LDAP'),
(1, 'region',           'US-EAST',      'LDAP'),
(2, 'clearance_level',  'L3',           'LDAP'),
(2, 'department',       'HR',           'LDAP'),
(2, 'region',           'US-MIDWEST',   'LDAP'),
(5, 'clearance_level',  'L3',           'LDAP'),
(5, 'department',       'Finance',      'LDAP'),
(5, 'region',           'US-EAST',      'LDAP'),
(6, 'clearance_level',  'L2',           'LDAP'),
(6, 'department',       'Engineering',  'LDAP'),
(6, 'region',           'US-SOUTH',     'LDAP');
```

---

### Part B: Metadata Management (Snowflake and Redshift)

```sql
-- ============================================================
-- PART B: METADATA MANAGEMENT (Platform Metadata Storage)
-- ============================================================

-- Platform registry — extensible to any future platform
CREATE TABLE metadata_platforms (
    platform_id         SERIAL PRIMARY KEY,
    platform_code       VARCHAR(50)  NOT NULL UNIQUE,   -- 'SNOWFLAKE', 'REDSHIFT', 'BIGQUERY', 'DATABRICKS'
    platform_name       VARCHAR(100) NOT NULL,
    platform_version    VARCHAR(50),
    connection_alias    VARCHAR(100),                   -- internal reference name
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Databases (top-level namespace per platform)
CREATE TABLE metadata_databases (
    database_id         SERIAL PRIMARY KEY,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    database_name       VARCHAR(255) NOT NULL,
    database_owner      VARCHAR(255),
    is_transient        BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(platform_id, database_name)
);

-- Schemas
CREATE TABLE metadata_schemas (
    schema_id           SERIAL PRIMARY KEY,
    database_id         INTEGER NOT NULL REFERENCES metadata_databases(database_id),
    schema_name         VARCHAR(255) NOT NULL,
    schema_owner        VARCHAR(255),
    is_managed_access   BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(database_id, schema_name)
);

-- Tables / Views / Materialized Views
CREATE TABLE metadata_tables (
    table_id            SERIAL PRIMARY KEY,
    schema_id           INTEGER NOT NULL REFERENCES metadata_schemas(schema_id),
    table_name          VARCHAR(255) NOT NULL,
    table_type          VARCHAR(50)  NOT NULL
                        CHECK (table_type IN ('TABLE','VIEW','MATERIALIZED_VIEW','EXTERNAL_TABLE','STREAM','DYNAMIC_TABLE')),
    table_owner         VARCHAR(255),
    row_count_estimate  BIGINT,
    bytes_estimate      BIGINT,
    clustering_keys     VARCHAR(500),    -- comma-separated for Snowflake
    is_transient        BOOLEAN DEFAULT FALSE,
    created_at_source   TIMESTAMPTZ,
    last_altered_source TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(schema_id, table_name)
);

-- Columns
CREATE TABLE metadata_columns (
    column_id           SERIAL PRIMARY KEY,
    table_id            INTEGER NOT NULL REFERENCES metadata_tables(table_id),
    column_name         VARCHAR(255) NOT NULL,
    ordinal_position    INTEGER      NOT NULL,
    data_type           VARCHAR(100) NOT NULL,          -- native type string from platform
    normalized_type     VARCHAR(50)  NOT NULL           -- unified type: TEXT, NUMBER, BOOLEAN, DATE, TIMESTAMP, BINARY
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

-- Tags / Labels (e.g., PII, Sensitive, PHI)
CREATE TABLE metadata_tags (
    tag_id              SERIAL PRIMARY KEY,
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    tag_name            VARCHAR(255) NOT NULL,
    tag_category        VARCHAR(100),                   -- 'SENSITIVITY', 'DATA_CLASS', 'COMPLIANCE'
    allowed_values      TEXT,                           -- comma-separated; NULL means free-form
    UNIQUE(platform_id, tag_name)
);

-- Tag assignments to tables or columns
CREATE TABLE metadata_tag_assignments (
    assignment_id       SERIAL PRIMARY KEY,
    tag_id              INTEGER NOT NULL REFERENCES metadata_tags(tag_id),
    table_id            INTEGER REFERENCES metadata_tables(table_id),
    column_id           INTEGER REFERENCES metadata_columns(column_id),
    tag_value           VARCHAR(255),
    assigned_at_source  TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (table_id IS NOT NULL AND column_id IS NULL) OR
        (table_id IS NULL AND column_id IS NOT NULL)
    )
);

-- Data product ↔ table mappings (link governance to physical objects)
CREATE TABLE data_product_table_mappings (
    mapping_id          SERIAL PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES data_products(product_id),
    table_id            INTEGER NOT NULL REFERENCES metadata_tables(table_id),
    is_primary_table    BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(product_id, table_id)
);

-- ============================================================
-- SAMPLE DATA — PART B (Snowflake + Redshift metadata)
-- ============================================================

INSERT INTO metadata_platforms (platform_code, platform_name, platform_version, connection_alias) VALUES
('SNOWFLAKE',  'Snowflake Data Cloud', '8.x',  'snowflake-prod-acme'),
('REDSHIFT',   'Amazon Redshift',      '1.0',  'redshift-prod-acme');

-- Snowflake databases
INSERT INTO metadata_databases (platform_id, database_name, database_owner, last_synced_at) VALUES
(1, 'ACME_ANALYTICS', 'SYSADMIN',    NOW()),
(1, 'ACME_FINANCE',   'FINANCE_ROLE',NOW()),
(2, 'acme_dw',        'admin',       NOW()),
(2, 'acme_staging',   'etl_user',    NOW());

-- Snowflake schemas
INSERT INTO metadata_schemas (database_id, schema_name, schema_owner, last_synced_at) VALUES
(1, 'MARKETING',  'MARKETING_ROLE', NOW()),
(1, 'OPERATIONS', 'OPS_ROLE',       NOW()),
(2, 'GL',         'FINANCE_ROLE',   NOW()),
(2, 'PAYROLL',    'FINANCE_ROLE',   NOW()),
(3, 'marketing',  'analyst',        NOW()),
(3, 'finance',    'analyst',        NOW()),
(4, 'staging',    'etl_user',       NOW());

-- Snowflake tables
INSERT INTO metadata_tables (schema_id, table_name, table_type, table_owner, row_count_estimate, bytes_estimate, last_synced_at) VALUES
(1, 'CUSTOMER_PROFILES',    'TABLE', 'MARKETING_ROLE', 4500000, 2147483648, NOW()),
(1, 'CAMPAIGN_RESULTS',     'TABLE', 'MARKETING_ROLE', 850000,  536870912,  NOW()),
(1, 'CUSTOMER_SEGMENTS',    'TABLE', 'MARKETING_ROLE', 12000,   10485760,   NOW()),
(2, 'INVENTORY_DAILY',      'TABLE', 'OPS_ROLE',       365000,  805306368,  NOW()),
(3, 'GL_TRANSACTIONS',      'TABLE', 'FINANCE_ROLE',   12000000,4294967296, NOW()),
(3, 'CHART_OF_ACCOUNTS',    'TABLE', 'FINANCE_ROLE',   5000,    1048576,    NOW()),
(4, 'EMPLOYEE_SALARIES',    'TABLE', 'FINANCE_ROLE',   8000,    2097152,    NOW()),
(5, 'customer_profiles',    'TABLE', 'analyst',        3000000, 1610612736, NOW()),
(5, 'campaign_attribution', 'TABLE', 'analyst',        500000,  268435456,  NOW()),
(6, 'revenue_summary',      'TABLE', 'analyst',        24000,   16777216,   NOW());

-- Snowflake columns (sample for CUSTOMER_PROFILES)
INSERT INTO metadata_columns (table_id, column_name, ordinal_position, data_type, normalized_type, is_nullable, is_primary_key, comment_text) VALUES
(1, 'CUSTOMER_ID',        1, 'NUMBER(38,0)',    'NUMBER',    FALSE, TRUE,  'Unique customer identifier'),
(1, 'FIRST_NAME',         2, 'VARCHAR(100)',    'TEXT',      TRUE,  FALSE, 'Customer first name - PII'),
(1, 'LAST_NAME',          3, 'VARCHAR(100)',    'TEXT',      TRUE,  FALSE, 'Customer last name - PII'),
(1, 'EMAIL',              4, 'VARCHAR(255)',    'TEXT',      TRUE,  FALSE, 'Customer email address - PII'),
(1, 'PHONE',              5, 'VARCHAR(20)',     'TEXT',      TRUE,  FALSE, 'Customer phone number - PII'),
(1, 'DATE_OF_BIRTH',      6, 'DATE',            'DATE',      TRUE,  FALSE, 'Customer DOB - PII/Sensitive'),
(1, 'ANNUAL_INCOME_USD',  7, 'NUMBER(15,2)',    'NUMBER',    TRUE,  FALSE, 'Estimated annual income - Sensitive'),
(1, 'REGION',             8, 'VARCHAR(50)',     'TEXT',      TRUE,  FALSE, 'Customer geographic region'),
(1, 'SEGMENT_CODE',       9, 'VARCHAR(20)',     'TEXT',      TRUE,  FALSE, 'Customer segment classification'),
(1, 'CREATED_AT',        10, 'TIMESTAMP_NTZ',  'TIMESTAMP', FALSE, FALSE, 'Record creation timestamp');

-- Redshift columns (sample for customer_profiles)
INSERT INTO metadata_columns (table_id, column_name, ordinal_position, data_type, normalized_type, is_nullable, is_primary_key, comment_text) VALUES
(8, 'customer_id',       1, 'BIGINT',          'NUMBER',    FALSE, TRUE,  'Unique customer identifier'),
(8, 'first_name',        2, 'VARCHAR(100)',     'TEXT',      TRUE,  FALSE, 'Customer first name - PII'),
(8, 'last_name',         3, 'VARCHAR(100)',     'TEXT',      TRUE,  FALSE, 'Customer last name - PII'),
(8, 'email',             4, 'VARCHAR(255)',     'TEXT',      TRUE,  FALSE, 'Customer email - PII'),
(8, 'phone',             5, 'VARCHAR(20)',      'TEXT',      TRUE,  FALSE, 'Phone number - PII'),
(8, 'date_of_birth',     6, 'DATE',             'DATE',      TRUE,  FALSE, 'DOB - Sensitive/PII'),
(8, 'income_band',       7, 'VARCHAR(20)',      'TEXT',      TRUE,  FALSE, 'Income band classification'),
(8, 'region',            8, 'VARCHAR(50)',      'TEXT',      TRUE,  FALSE, 'Geographic region'),
(8, 'created_at',        9, 'TIMESTAMP',        'TIMESTAMP', FALSE, FALSE, 'Record creation timestamp');

-- Tags
INSERT INTO metadata_tags (platform_id, tag_name, tag_category, allowed_values) VALUES
(1, 'PII',               'DATA_CLASS',   'TRUE,FALSE'),
(1, 'SENSITIVITY',       'SENSITIVITY',  'LOW,MEDIUM,HIGH,CRITICAL'),
(1, 'COMPLIANCE',        'COMPLIANCE',   'GDPR,CCPA,HIPAA,SOX,NONE'),
(2, 'pii',               'DATA_CLASS',   'true,false'),
(2, 'sensitivity',       'SENSITIVITY',  'low,medium,high,critical');

-- Tag assignments
INSERT INTO metadata_tag_assignments (tag_id, column_id, tag_value, last_synced_at) VALUES
(1, 2,  'TRUE', NOW()),  -- CUSTOMER_PROFILES.FIRST_NAME = PII:TRUE
(1, 3,  'TRUE', NOW()),  -- CUSTOMER_PROFILES.LAST_NAME  = PII:TRUE
(1, 4,  'TRUE', NOW()),  -- CUSTOMER_PROFILES.EMAIL      = PII:TRUE
(1, 5,  'TRUE', NOW()),  -- CUSTOMER_PROFILES.PHONE      = PII:TRUE
(2, 7,  'HIGH', NOW()),  -- CUSTOMER_PROFILES.ANNUAL_INCOME = SENSITIVITY:HIGH
(2, 6,  'HIGH', NOW());  -- CUSTOMER_PROFILES.DATE_OF_BIRTH = SENSITIVITY:HIGH

-- Data product ↔ table mappings
INSERT INTO data_product_table_mappings (product_id, table_id, is_primary_table) VALUES
(5, 1, TRUE),   -- Customer 360 → CUSTOMER_PROFILES (Snowflake, primary)
(5, 8, FALSE),  -- Customer 360 → customer_profiles (Redshift, secondary)
(6, 2, TRUE),   -- Campaign Performance → CAMPAIGN_RESULTS (Snowflake)
(1, 10, TRUE),  -- Revenue Analytics → revenue_summary (Redshift)
(2, 5, TRUE);   -- GL Transactions → GL_TRANSACTIONS (Snowflake)
```

> **Extension Strategy for New Platforms:**  
> Adding BigQuery or Databricks requires only:
> 1. Insert a new row into `metadata_platforms` (`platform_code = 'BIGQUERY'`)
> 2. Sync metadata into the same normalized tables (`metadata_databases`, `metadata_schemas`, `metadata_tables`, `metadata_columns`)
> 3. Map platform-specific type names to `normalized_type` in the sync adapter
> 4. The `platform_id` foreign key on all metadata tables provides the discriminator — **no schema changes needed**

---

### Part C: Policy Storage

```sql
-- ============================================================
-- PART C: POLICY STORAGE (fully normalized, no JSONB)
-- ============================================================

-- Policies (top-level entity)
CREATE TABLE policies (
    policy_id           SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    policy_name         VARCHAR(255) NOT NULL,
    policy_code         VARCHAR(100) NOT NULL,
    description         TEXT,
    domain_id           INTEGER REFERENCES data_domains(domain_id),
    product_id          INTEGER REFERENCES data_products(product_id),
    owner_user_id       INTEGER NOT NULL REFERENCES users(user_id),
    enforce_mode        VARCHAR(20) NOT NULL DEFAULT 'ADVISORY'
                        CHECK (enforce_mode IN ('ADVISORY','ENFORCED')),
    current_version_id  INTEGER,                        -- FK set after first version insert
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','VALIDATED','FAILED_VALIDATION','DEPLOYING','ENFORCED','DEPRECATED','ROLLBACK')),
    effective_date      DATE,
    expiry_date         DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, policy_code)
);

-- Policy versions (immutable snapshots)
CREATE TABLE policy_versions (
    version_id          SERIAL PRIMARY KEY,
    policy_id           INTEGER NOT NULL REFERENCES policies(policy_id),
    version_number      INTEGER NOT NULL,
    version_label       VARCHAR(50),                    -- e.g., 'v1.0', 'v2.1-hotfix'
    is_current          BOOLEAN NOT NULL DEFAULT FALSE,
    authored_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
    reviewed_by_user_id INTEGER REFERENCES users(user_id),
    approved_by_user_id INTEGER REFERENCES users(user_id),
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','DEPLOYED','ROLLED_BACK')),
    change_summary      TEXT,
    opa_rego_hash       VARCHAR(64),                    -- SHA-256 of compiled Rego for integrity
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deployed_at         TIMESTAMPTZ,
    rolled_back_at      TIMESTAMPTZ,
    UNIQUE(policy_id, version_number)
);

-- Add FK from policies to policy_versions (circular, set after first insert)
ALTER TABLE policies ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id) REFERENCES policy_versions(version_id)
    DEFERRABLE INITIALLY DEFERRED;

-- Policy rules (one policy version has many rules)
CREATE TABLE policy_rules (
    rule_id             SERIAL PRIMARY KEY,
    version_id          INTEGER NOT NULL REFERENCES policy_versions(version_id),
    rule_name           VARCHAR(255) NOT NULL,
    rule_description    TEXT,
    rule_order          INTEGER NOT NULL DEFAULT 0,     -- evaluation order
    rule_type           VARCHAR(50)  NOT NULL
                        CHECK (rule_type IN ('RBAC','ABAC','COMBINED')),
    effect              VARCHAR(10)  NOT NULL
                        CHECK (effect IN ('ALLOW','DENY')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rule subjects (who does this rule apply to)
CREATE TABLE policy_rule_subjects (
    subject_id          SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id),
    subject_type        VARCHAR(30)  NOT NULL
                        CHECK (subject_type IN ('ROLE','USER','ABAC_GROUP','ANY')),
    role_id             INTEGER REFERENCES roles(role_id),
    user_id             INTEGER REFERENCES users(user_id),
    abac_group_id       INTEGER,                        -- FK to abac_attribute_groups (defined below)
    CONSTRAINT chk_subject_ref CHECK (
        (subject_type = 'ROLE'  AND role_id IS NOT NULL) OR
        (subject_type = 'USER'  AND user_id IS NOT NULL) OR
        (subject_type = 'ABAC_GROUP' AND abac_group_id IS NOT NULL) OR
        (subject_type = 'ANY')
    )
);

-- Rule resources (what data objects does the rule protect)
CREATE TABLE policy_rule_resources (
    resource_id         SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id),
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    database_id         INTEGER REFERENCES metadata_databases(database_id),
    schema_id           INTEGER REFERENCES metadata_schemas(schema_id),
    table_id            INTEGER REFERENCES metadata_tables(table_id),
    resource_scope      VARCHAR(30) NOT NULL
                        CHECK (resource_scope IN ('DATABASE','SCHEMA','TABLE','COLUMN','TAG'))
);

-- Column-level resource scoping (for column masking rules)
CREATE TABLE policy_rule_resource_columns (
    id                  SERIAL PRIMARY KEY,
    resource_id         INTEGER NOT NULL REFERENCES policy_rule_resources(resource_id),
    column_id           INTEGER NOT NULL REFERENCES metadata_columns(column_id),
    UNIQUE(resource_id, column_id)
);

-- Tag-level resource scoping (dynamic: applies to all objects with matching tag)
CREATE TABLE policy_rule_resource_tags (
    id                  SERIAL PRIMARY KEY,
    resource_id         INTEGER NOT NULL REFERENCES policy_rule_resources(resource_id),
    tag_id              INTEGER NOT NULL REFERENCES metadata_tags(tag_id),
    tag_value           VARCHAR(255),                   -- NULL = any tag value
    UNIQUE(resource_id, tag_id, tag_value)
);

-- Rule actions (what happens when rule matches)
CREATE TABLE policy_rule_actions (
    action_id           SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id),
    action_type         VARCHAR(50)  NOT NULL
                        CHECK (action_type IN ('GRANT_SELECT','GRANT_INSERT','GRANT_UPDATE','DENY_ACCESS','MASK_COLUMN','FILTER_ROWS','AUDIT_LOG')),
    mask_type           VARCHAR(50)
                        CHECK (mask_type IN ('NULL_MASK','HASH_SHA256','PARTIAL_MASK','EMAIL_MASK','PHONE_MASK','CUSTOM')),
    mask_expression     TEXT,                           -- SQL expression for CUSTOM mask type
    filter_column       VARCHAR(255),                   -- column used in row filter
    filter_operator     VARCHAR(20)
                        CHECK (filter_operator IN ('EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS')),
    filter_value_type   VARCHAR(30)
                        CHECK (filter_value_type IN ('LITERAL','USER_ATTRIBUTE','SESSION_CONTEXT')),
    filter_value        VARCHAR(255),                   -- literal value or attribute key name
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ABAC conditions (row-level conditions for rule evaluation)
CREATE TABLE policy_rule_conditions (
    condition_id        SERIAL PRIMARY KEY,
    rule_id             INTEGER NOT NULL REFERENCES policy_rules(rule_id),
    condition_group     INTEGER NOT NULL DEFAULT 1,     -- conditions within a group are AND-ed; groups are OR-ed
    attribute_type      VARCHAR(30)  NOT NULL
                        CHECK (attribute_type IN ('USER_ATTRIBUTE','RESOURCE_ATTRIBUTE','ENV_ATTRIBUTE','SESSION_ATTRIBUTE')),
    attribute_key       VARCHAR(100) NOT NULL,
    operator            VARCHAR(30)  NOT NULL
                        CHECK (operator IN ('EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS','REGEX','IS_NULL','IS_NOT_NULL')),
    compare_value_type  VARCHAR(30)  NOT NULL
                        CHECK (compare_value_type IN ('LITERAL','ATTRIBUTE_REF')),
    compare_value       VARCHAR(500),                   -- literal string or referenced attribute key
    is_negated          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ABAC attribute groups (pre-defined attribute combinations)
CREATE TABLE abac_attribute_groups (
    group_id            SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    group_name          VARCHAR(255) NOT NULL,
    group_description   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ABAC attribute group members
CREATE TABLE abac_attribute_group_members (
    member_id           SERIAL PRIMARY KEY,
    group_id            INTEGER NOT NULL REFERENCES abac_attribute_groups(group_id),
    attribute_key       VARCHAR(100) NOT NULL,
    operator            VARCHAR(30)  NOT NULL,
    compare_value       VARCHAR(500) NOT NULL,
    UNIQUE(group_id, attribute_key)
);

-- Platform deployment targets per policy version
CREATE TABLE policy_version_targets (
    target_id           SERIAL PRIMARY KEY,
    version_id          INTEGER NOT NULL REFERENCES policy_versions(version_id),
    platform_id         INTEGER NOT NULL REFERENCES metadata_platforms(platform_id),
    deployment_status   VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (deployment_status IN ('PENDING','IN_PROGRESS','SUCCESS','FAILED','ROLLED_BACK')),
    temporal_workflow_id VARCHAR(255),
    deployed_at         TIMESTAMPTZ,
    error_message       TEXT,
    UNIQUE(version_id, platform_id)
);

-- Audit events
CREATE TABLE audit_events (
    event_id            BIGSERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(organization_id),
    event_type          VARCHAR(100) NOT NULL,          -- 'POLICY_CREATED', 'POLICY_DEPLOYED', 'ACCESS_DENIED', etc.
    event_timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id       INTEGER REFERENCES users(user_id),
    actor_service       VARCHAR(100),                   -- service name if system-initiated
    policy_id           INTEGER REFERENCES policies(policy_id),
    policy_version_id   INTEGER REFERENCES policy_versions(version_id),
    platform_id         INTEGER REFERENCES metadata_platforms(platform_id),
    resource_path       VARCHAR(1000),                  -- e.g., 'SNOWFLAKE/ACME_ANALYTICS/MARKETING/CUSTOMER_PROFILES'
    outcome             VARCHAR(20)  NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE','ADVISORY')),
    detail_text         TEXT
);

CREATE INDEX idx_audit_events_timestamp     ON audit_events(event_timestamp DESC);
CREATE INDEX idx_audit_events_policy        ON audit_events(policy_id);
CREATE INDEX idx_audit_events_actor_user    ON audit_events(actor_user_id);
CREATE INDEX idx_audit_events_platform      ON audit_events(platform_id);
```

---

## 4. Microservices Architecture and Tech Stack

### 4.1 Service Inventory

| # | Service | Port | Primary Role |
|---|---|---|---|
| 1 | `frontend-service` | 3000 | React UI |
| 2 | `policy-authoring-service` | 8001 | Policy CRUD |
| 3 | `policy-validation-service` | 8002 | OPA integration |
| 4 | `metadata-service` | 8003 | Platform metadata queries |
| 5 | `enforcement-service` | 8004 | Temporal workflow triggers |
| 6 | `user-rbac-service` | 8005 | Users, roles, ABAC attributes |
| 7 | `snowflake-connector` | 8006 | Snowflake policy enforcement |
| 8 | `redshift-connector` | 8007 | Redshift policy enforcement |
| 9 | `temporal-server` | 7233 | Workflow orchestration engine |
| 10 | `keycloak` | 8080 | Auth/Identity (OIDC + LDAP) |
| 11 | `traefik` | 80/443 | API Gateway |
| 12 | `postgresql` | 5432 | Primary datastore |

---

### 4.2 Policy Authoring Service

**Responsibility:** Central hub for policy CRUD operations. Backed by React UI. Manages policy lifecycle from DRAFT to DEPRECATED.

**Tech Stack:**
- Language: Python 3.12
- Framework: FastAPI 0.115+
- Validation: Pydantic V2
- DB: SQLAlchemy 2.0 (async) + asyncpg
- Auth: python-jose + httpx (Keycloak token introspection)

**Folder Structure:**
```
policy-authoring-service/
├── src/
│   ├── main.py                    # FastAPI app factory
│   ├── api/
│   │   ├── v1/
│   │   │   ├── policies.py        # /policies CRUD endpoints
│   │   │   ├── versions.py        # /policies/{id}/versions
│   │   │   ├── rules.py           # /policies/{id}/rules CRUD
│   │   │   └── conditions.py      # /rules/{id}/conditions
│   ├── models/
│   │   ├── policy.py              # SQLAlchemy ORM models
│   │   ├── rule.py
│   │   └── condition.py
│   ├── schemas/                   # Pydantic V2 schemas
│   │   ├── policy.py
│   │   ├── rule.py
│   │   └── condition.py
│   ├── services/
│   │   ├── policy_service.py      # Business logic
│   │   ├── version_service.py     # Versioning logic
│   │   └── validation_client.py   # HTTP client → validation-service
│   ├── db/
│   │   ├── session.py             # Async session factory
│   │   └── migrations/            # Alembic migrations
│   └── core/
│       ├── config.py              # Settings (Pydantic BaseSettings)
│       ├── security.py            # JWT validation
│       └── logging.py
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── pyproject.toml
└── alembic.ini
```

**Dockerfile:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv pip install --system -e .
COPY src/ ./src/
EXPOSE 8001
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**Key API Endpoints:**
```
POST   /api/v1/policies                         — Create draft policy
GET    /api/v1/policies                         — List policies (paginated)
GET    /api/v1/policies/{policy_id}             — Get policy detail
PUT    /api/v1/policies/{policy_id}             — Update draft policy
POST   /api/v1/policies/{policy_id}/submit      — Submit for validation
POST   /api/v1/policies/{policy_id}/rollback    — Rollback to prior version
GET    /api/v1/policies/{policy_id}/versions    — Version history
POST   /api/v1/policies/{policy_id}/rules       — Add rule to policy
DELETE /api/v1/policies/{policy_id}/rules/{rid} — Remove rule
```

---

### 4.3 Policy Validation Service

**Responsibility:** Translates relational policy data into OPA Rego documents, executes evaluation, returns structured validation results.

**Tech Stack:**
- Language: Python 3.12
- Framework: FastAPI 0.115+
- OPA Integration: `requests` (HTTP to OPA sidecar) or `opa-python-client`
- OPA sidecar: Official `openpolicyagent/opa` container

**Folder Structure:**
```
policy-validation-service/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   └── validation.py          # POST /validate, POST /simulate
│   ├── engines/
│   │   ├── opa_client.py          # OPA HTTP API client
│   │   ├── rego_builder.py        # Translates DB rows → Rego document
│   │   └── conflict_detector.py   # Cross-policy conflict analysis
│   ├── schemas/
│   │   └── validation.py          # ValidationRequest / ValidationResult
│   └── core/
│       └── config.py
├── rego/
│   ├── policy_base.rego           # Base Rego policies and helpers
│   ├── rbac_rules.rego            # RBAC evaluation rules
│   ├── abac_rules.rego            # ABAC evaluation rules
│   └── conflict_rules.rego        # Conflict detection rules
├── tests/
├── Dockerfile
└── docker-compose.opa.yml         # OPA sidecar config
```

**OPA Sidecar Configuration:**
```yaml
# docker-compose.opa.yml
services:
  opa:
    image: openpolicyagent/opa:latest-rootless
    command: run --server --addr :8181 --log-format json /policies
    volumes:
      - ./rego:/policies
    ports:
      - "8181:8181"
```

**Sample Rego Policy (rbac_rules.rego):**
```rego
package policy.rbac

import future.keywords.if
import future.keywords.in

default allow := false

allow if {
    # User has a role that matches a subject in an ALLOW rule
    some rule in input.policy.rules
    rule.effect == "ALLOW"
    rule.rule_type in {"RBAC", "COMBINED"}
    some subject in rule.subjects
    subject.subject_type == "ROLE"
    subject.role_code in input.user.roles
    
    # All conditions pass
    all_conditions_pass(rule)
}

all_conditions_pass(rule) if {
    count(rule.conditions) == 0
}

all_conditions_pass(rule) if {
    count(rule.conditions) > 0
    every condition in rule.conditions {
        evaluate_condition(condition)
    }
}

evaluate_condition(condition) if {
    condition.attribute_type == "USER_ATTRIBUTE"
    user_attr := input.user.attributes[condition.attribute_key]
    condition.operator == "EQ"
    user_attr == condition.compare_value
}

evaluate_condition(condition) if {
    condition.attribute_type == "USER_ATTRIBUTE"
    user_attr := input.user.attributes[condition.attribute_key]
    condition.operator == "IN"
    user_attr in condition.compare_value
}
```

---

### 4.4 Metadata Service

**Responsibility:** Exposes platform metadata (tables, columns, tags) for policy rule creation and data discovery.

**Folder Structure:**
```
metadata-service/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   ├── platforms.py           # GET /platforms
│   │   ├── databases.py           # GET /platforms/{id}/databases
│   │   ├── schemas.py             # GET /databases/{id}/schemas
│   │   ├── tables.py              # GET /schemas/{id}/tables
│   │   ├── columns.py             # GET /tables/{id}/columns
│   │   ├── tags.py                # GET /tags, POST /tags/assign
│   │   └── search.py              # GET /search?q=customer&type=table
│   ├── services/
│   │   ├── metadata_service.py
│   │   ├── sync/
│   │   │   ├── base_syncer.py     # Abstract syncer interface
│   │   │   ├── snowflake_syncer.py
│   │   │   └── redshift_syncer.py
│   └── core/config.py
├── tests/
├── Dockerfile
└── pyproject.toml
```

---

### 4.5 Enforcement Service

**Responsibility:** Receives deployment triggers from Policy Authoring Service and initiates Temporal workflows to deploy policies to target platforms.

**Folder Structure:**
```
enforcement-service/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   ├── deployments.py         # POST /deploy, GET /deployments/{id}
│   │   └── status.py              # GET /deployments/{id}/status
│   ├── temporal/
│   │   ├── client.py              # Temporal client setup
│   │   ├── workflows/
│   │   │   └── policy_deployment.py   # Main workflow definition
│   │   └── activities/
│   │       ├── validate_activity.py
│   │       ├── precheck_activity.py
│   │       ├── deploy_activity.py
│   │       ├── verify_activity.py
│   │       └── rollback_activity.py
│   └── core/config.py
├── Dockerfile
└── pyproject.toml
```

---

### 4.6 Snowflake Connector

**Responsibility:** Translates abstract policy rules into Snowflake-native constructs (row access policies, masking policies, RBAC grants). Manages lifecycle independently after initial push.

**Tech Stack:**
- Language: Python 3.12
- Framework: FastAPI
- Snowflake: `snowflake-connector-python` + `snowflake-sqlalchemy`

**Folder Structure:**
```
snowflake-connector/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   ├── apply.py               # POST /apply-policy
│   │   ├── revoke.py              # POST /revoke-policy
│   │   ├── verify.py              # GET /verify/{policy_version_id}
│   │   └── rollback.py            # POST /rollback
│   ├── translators/
│   │   ├── row_filter_translator.py    # → CREATE ROW ACCESS POLICY
│   │   ├── masking_translator.py       # → CREATE MASKING POLICY
│   │   └── grant_translator.py         # → GRANT ... TO ROLE
│   ├── executor/
│   │   └── snowflake_executor.py   # Executes SQL via connector
│   └── core/config.py
├── tests/
├── Dockerfile
└── pyproject.toml
```

**Sample Translation (row filter):**
```python
def translate_filter_rule(rule: PolicyRule) -> str:
    """Translate a FILTER_ROWS action to Snowflake ROW ACCESS POLICY SQL."""
    action = rule.actions[0]
    policy_name = f"rap_{rule.rule_id}_{rule.version_id}"
    
    if action.filter_value_type == "USER_ATTRIBUTE":
        condition = f"SYSTEM$CONTEXT_CURRENT_USER_ATTRIBUTE('{action.filter_value}') = {action.filter_column}"
    elif action.filter_value_type == "LITERAL":
        condition = f"{action.filter_column} = '{action.filter_value}'"
    
    return f"""
    CREATE OR REPLACE ROW ACCESS POLICY {policy_name}
    AS (col VARCHAR) RETURNS BOOLEAN ->
        CASE
            WHEN CURRENT_ROLE() IN ({",".join([f"'{r}'" for r in rule.allowed_roles])})
            THEN {condition}
            ELSE FALSE
        END;
    """
```

---

### 4.7 Redshift Connector

**Responsibility:** Equivalent to Snowflake Connector but uses Redshift RLS and IAM-based grants.

**Tech Stack:**
- Language: Python 3.12
- Framework: FastAPI
- Redshift: `psycopg2-binary` (Redshift speaks PostgreSQL wire protocol)

**Folder Structure:**
```
redshift-connector/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   ├── apply.py
│   │   ├── revoke.py
│   │   ├── verify.py
│   │   └── rollback.py
│   ├── translators/
│   │   ├── rls_translator.py          # → CREATE RLS POLICY
│   │   ├── column_mask_translator.py  # → CREATE MASKING POLICY (Redshift)
│   │   └── grant_translator.py
│   └── core/config.py
├── tests/
├── Dockerfile
└── pyproject.toml
```

---

### 4.8 User & RBAC Service

**Responsibility:** Manages users, roles, role hierarchies, and ABAC attribute groups. Synchronizes from Keycloak/LDAP.

**Folder Structure:**
```
user-rbac-service/
├── src/
│   ├── main.py
│   ├── api/v1/
│   │   ├── users.py               # User CRUD + attribute management
│   │   ├── roles.py               # Role hierarchy management
│   │   ├── mappings.py            # User-role mapping CRUD
│   │   └── abac_groups.py         # ABAC attribute group management
│   ├── services/
│   │   ├── ldap_sync_service.py   # Keycloak/LDAP → PostgreSQL sync
│   │   └── rbac_service.py        # Role resolution with hierarchy
│   └── core/config.py
├── Dockerfile
└── pyproject.toml
```

---

### 4.9 Frontend Service

**Responsibility:** React SPA with Mantine UI for policy authoring, metadata browsing, role management, and audit dashboards.

**Tech Stack:**
- React 18 + TypeScript 5
- Mantine UI v7
- React Query (TanStack Query v5) for API state
- React Router v6
- Vite for bundling
- Playwright for E2E tests

**Folder Structure:**
```
frontend-service/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── PolicyStudio/          # Policy authoring wizard
│   │   ├── DataCatalog/           # Metadata browser
│   │   ├── RoleManager/           # User & role management
│   │   ├── AuditDashboard/        # Audit log viewer
│   │   └── Deployments/           # Deployment status tracker
│   ├── components/
│   │   ├── PolicyRuleBuilder/     # Drag-and-drop rule builder
│   │   ├── ConditionEditor/       # ABAC condition form
│   │   ├── PlatformSelector/      # Target platform picker
│   │   └── StatusBadge/           # Policy status indicator
│   ├── api/
│   │   ├── client.ts              # Axios instance + interceptors
│   │   ├── policies.ts            # Policy API calls
│   │   ├── metadata.ts
│   │   └── users.ts
│   ├── hooks/
│   │   ├── usePolicies.ts
│   │   └── useMetadata.ts
│   └── types/
│       └── api.types.ts           # TypeScript interfaces
├── tests/
│   └── e2e/                       # Playwright tests
├── Dockerfile
├── nginx.conf                     # Static serving config
├── vite.config.ts
└── package.json
```

---

## 5. RBAC and ABAC Implementation

### 5.1 RBAC: Role Hierarchy and Enforcement

```
Role Hierarchy Example:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUPER_ADMIN
    └── POLICY_ADMIN
            └── POLICY_AUTHOR
DATA_ENGINEER
    └── DATA_ANALYST
            └── DATA_VIEWER

Finance Analyst inherits: DATA_ANALYST + FINANCE domain scope
HR Analyst inherits:      DATA_ANALYST + HR domain scope
```

**Role Hierarchy Resolution (SQL):**
```sql
-- Recursive CTE to resolve all roles for a user (including inherited)
WITH RECURSIVE role_hierarchy AS (
    -- Base case: direct role assignments for user
    SELECT r.role_id, r.role_code, r.role_name, r.parent_role_id, 0 AS depth
    FROM roles r
    INNER JOIN user_role_mappings urm ON r.role_id = urm.role_id
    WHERE urm.user_id = :user_id
      AND urm.is_active = TRUE
      AND (urm.expires_at IS NULL OR urm.expires_at > NOW())
    
    UNION ALL
    
    -- Recursive case: parent roles
    SELECT r.role_id, r.role_code, r.role_name, r.parent_role_id, rh.depth + 1
    FROM roles r
    INNER JOIN role_hierarchy rh ON r.role_id = rh.parent_role_id
    WHERE rh.depth < 10  -- guard against infinite loops
)
SELECT DISTINCT role_id, role_code, role_name
FROM role_hierarchy;
```

**Permission Enforcement at Platform Level:**
- Snowflake: Native RBAC via `GRANT ... TO ROLE` + Snowflake's own role hierarchy
- Redshift: `GRANT ... TO GROUP` + Redshift RLS role attachment
- The connector translates our internal role codes to platform-native roles (maintained in a `platform_role_mappings` table)

---

### 5.2 ABAC: Attribute Definitions and Evaluation

**Three Attribute Dimensions:**

| Dimension | Examples | Source |
|---|---|---|
| **User Attributes** | `department`, `clearance_level`, `region`, `job_title` | LDAP / Keycloak claims |
| **Resource Attributes** | `data_sensitivity`, `tag:PII`, `domain_code` | Metadata service |
| **Environment Attributes** | `current_time`, `day_of_week`, `request_ip_country` | Runtime context |

**ABAC Condition Evaluation Logic:**
```
Conditions are grouped into condition_groups:
  - Conditions within the same group → AND logic
  - Different groups → OR logic

Example:
  Group 1: department = 'Finance' AND clearance_level >= 'L3'
  Group 2: role = 'FINANCE_ANALYST'
  Result:  (dept=Finance AND clearance>=L3) OR role=FINANCE_ANALYST
```

---

### 5.3 Combined RBAC + ABAC Policy Example

**Business Rule:** "Finance Analysts with clearance L3+ in the US-EAST region can view full GL transaction data, but other Finance Analysts see only non-sensitive columns."

**SQL representation of this policy:**

```sql
-- Insert policy
INSERT INTO policies (organization_id, policy_name, policy_code, owner_user_id, domain_id, product_id, enforce_mode)
VALUES (1, 'GL Transaction Access Policy', 'POL-GL-001', 1, 1, 2, 'ENFORCED');

-- Insert version
INSERT INTO policy_versions (policy_id, version_number, version_label, authored_by_user_id, status, is_current)
VALUES (1, 1, 'v1.0', 1, 'APPROVED', TRUE);

-- Rule 1: Full access for senior Finance Analysts in US-EAST
INSERT INTO policy_rules (version_id, rule_name, rule_order, rule_type, effect)
VALUES (1, 'Senior Finance Full Access', 1, 'COMBINED', 'ALLOW');

-- Subject: Finance Analyst role
INSERT INTO policy_rule_subjects (rule_id, subject_type, role_id)
VALUES (1, 'ROLE', 6);  -- Finance Analyst role

-- ABAC Condition 1 (group 1): clearance_level >= L3
INSERT INTO policy_rule_conditions (rule_id, condition_group, attribute_type, attribute_key, operator, compare_value_type, compare_value)
VALUES (1, 1, 'USER_ATTRIBUTE', 'clearance_level', 'IN', 'LITERAL', 'L3,L4,L5');

-- ABAC Condition 2 (group 1): region = US-EAST (AND with above)
INSERT INTO policy_rule_conditions (rule_id, condition_group, attribute_type, attribute_key, operator, compare_value_type, compare_value)
VALUES (1, 1, 'USER_ATTRIBUTE', 'region', 'EQ', 'LITERAL', 'US-EAST');

-- Action: Grant SELECT on GL_TRANSACTIONS
INSERT INTO policy_rule_actions (rule_id, action_type)
VALUES (1, 'GRANT_SELECT');

-- Rule 2: Masked access for other Finance Analysts
INSERT INTO policy_rules (version_id, rule_name, rule_order, rule_type, effect)
VALUES (1, 'Standard Finance Masked Access', 2, 'RBAC', 'ALLOW');

INSERT INTO policy_rule_subjects (rule_id, subject_type, role_id)
VALUES (2, 'ROLE', 6);

INSERT INTO policy_rule_actions (rule_id, action_type, mask_type)
VALUES (2, 'MASK_COLUMN', 'NULL_MASK');  -- Sensitive columns nulled out
```

**Pseudocode for Policy Evaluation:**
```python
def evaluate_policy(user: User, resource: Resource, action: str) -> Decision:
    # Get user's full role set (including hierarchy)
    user_roles = get_user_roles_with_hierarchy(user.user_id)
    user_attrs = get_user_attributes(user.user_id)
    resource_attrs = get_resource_attributes(resource.table_id)
    
    # Load active policy rules for this resource
    rules = get_active_rules(resource.table_id, resource.platform_id)
    
    # Sort by rule_order (lower = higher priority)
    rules.sort(key=lambda r: r.rule_order)
    
    final_decision = Decision(effect="DENY", masks=[], filters=[])
    
    for rule in rules:
        # Check RBAC subject match
        if not check_subject_match(rule, user_roles, user_attrs):
            continue
        
        # Check ABAC conditions (grouped AND/OR)
        if not evaluate_conditions(rule.conditions, user_attrs, resource_attrs):
            continue
        
        # Rule matches — apply actions
        for action in rule.actions:
            if action.action_type == "GRANT_SELECT" and rule.effect == "ALLOW":
                final_decision.effect = "ALLOW"
            elif action.action_type == "MASK_COLUMN":
                final_decision.masks.append(action)
            elif action.action_type == "FILTER_ROWS":
                final_decision.filters.append(action)
            elif action.action_type == "DENY_ACCESS" and rule.effect == "DENY":
                return Decision(effect="DENY")  # explicit DENY is terminal
    
    return final_decision

def evaluate_conditions(conditions: list, user_attrs: dict, resource_attrs: dict) -> bool:
    # Group conditions by condition_group
    groups = group_by(conditions, 'condition_group')
    
    # OR across groups
    for group_id, group_conditions in groups.items():
        # AND within group
        if all(evaluate_single_condition(c, user_attrs, resource_attrs) for c in group_conditions):
            return True
    
    return False
```

---

## 6. Temporal Workflow Integration

### 6.1 Policy Deployment Workflow Design

```python
# enforcement-service/src/temporal/workflows/policy_deployment.py

from temporalio import workflow
from temporalio.common import RetryPolicy
from datetime import timedelta

@workflow.defn(name="PolicyDeploymentWorkflow")
class PolicyDeploymentWorkflow:
    
    @workflow.run
    async def run(self, input: PolicyDeploymentInput) -> PolicyDeploymentResult:
        policy_id = input.policy_id
        version_id = input.version_id
        target_platforms = input.target_platform_ids
        
        # ── Step 1: Re-validate policy (idempotent safety check) ──────────
        validation_result = await workflow.execute_activity(
            validate_policy_activity,
            args=[version_id],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=2))
        )
        if not validation_result.is_valid:
            await workflow.execute_activity(
                update_deployment_status_activity,
                args=[version_id, "FAILED", f"Validation failed: {validation_result.errors}"]
            )
            return PolicyDeploymentResult(success=False, reason="validation_failed")
        
        # ── Step 2: Platform pre-checks ────────────────────────────────────
        for platform_id in target_platforms:
            precheck_result = await workflow.execute_activity(
                platform_precheck_activity,
                args=[platform_id, version_id],
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2)
            )
            if not precheck_result.healthy:
                await workflow.execute_activity(
                    update_deployment_status_activity,
                    args=[version_id, "FAILED", f"Platform {platform_id} health check failed"]
                )
                return PolicyDeploymentResult(success=False, reason="precheck_failed")
        
        # ── Step 3: Deploy to each platform (rollback-aware) ──────────────
        deployed_platforms = []
        for platform_id in target_platforms:
            try:
                deploy_result = await workflow.execute_activity(
                    deploy_to_platform_activity,
                    args=[platform_id, version_id],
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=RetryPolicy(
                        maximum_attempts=3,
                        initial_interval=timedelta(seconds=5),
                        maximum_interval=timedelta(seconds=60),
                        backoff_coefficient=2.0
                    )
                )
                deployed_platforms.append(platform_id)
            except Exception as e:
                # Rollback all successfully deployed platforms
                for deployed_id in deployed_platforms:
                    await workflow.execute_activity(
                        rollback_platform_activity,
                        args=[deployed_id, version_id],
                        start_to_close_timeout=timedelta(minutes=5),
                        retry_policy=RetryPolicy(maximum_attempts=5)
                    )
                return PolicyDeploymentResult(success=False, reason=f"deploy_failed: {str(e)}")
        
        # ── Step 4: Post-deployment verification ──────────────────────────
        for platform_id in deployed_platforms:
            verify_result = await workflow.execute_activity(
                verify_platform_deployment_activity,
                args=[platform_id, version_id],
                start_to_close_timeout=timedelta(seconds=30)
            )
            if not verify_result.verified:
                # Mark as warning but don't rollback — manual review needed
                await workflow.execute_activity(
                    create_audit_event_activity,
                    args=[version_id, "VERIFY_WARNING", verify_result.details]
                )
        
        # ── Step 5: Mark policy as ENFORCED ───────────────────────────────
        await workflow.execute_activity(
            finalize_deployment_activity,
            args=[version_id, deployed_platforms]
        )
        
        return PolicyDeploymentResult(success=True, deployed_platforms=deployed_platforms)
```

### 6.2 Activity Definitions

```python
# enforcement-service/src/temporal/activities/deploy_activity.py

from temporalio import activity
import httpx

@activity.defn(name="deploy_to_platform_activity")
async def deploy_to_platform_activity(platform_id: int, version_id: int) -> DeployResult:
    platform = await get_platform_by_id(platform_id)
    
    connector_url_map = {
        "SNOWFLAKE": settings.SNOWFLAKE_CONNECTOR_URL,
        "REDSHIFT":  settings.REDSHIFT_CONNECTOR_URL,
        "BIGQUERY":  settings.BIGQUERY_CONNECTOR_URL,  # future
    }
    
    connector_url = connector_url_map.get(platform.platform_code)
    if not connector_url:
        raise ValueError(f"No connector registered for platform: {platform.platform_code}")
    
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{connector_url}/api/v1/apply",
            json={"version_id": version_id, "platform_id": platform_id}
        )
        response.raise_for_status()
        return DeployResult(**response.json())
```

### 6.3 Retry and Timeout Configuration

| Activity | Timeout | Max Retries | Backoff |
|---|---|---|---|
| `validate_policy` | 30s | 3 | 2s, 4s, 8s |
| `platform_precheck` | 60s | 2 | 5s, 10s |
| `deploy_to_platform` | 10min | 3 | 5s → 60s (2x) |
| `rollback_platform` | 5min | 5 | 2s → 30s (2x) |
| `verify_deployment` | 30s | 1 | — |
| `finalize_deployment` | 10s | 3 | 1s, 2s, 4s |

**Workflow-level schedule-to-close timeout:** 60 minutes  
**On workflow timeout:** Trigger `EmergencyRollbackWorkflow` for any deployed platforms

---

## 7. Inter-Service Communication and Integration

### 7.1 Communication Patterns

```
┌──────────────────────────────────────────────────────────────────────┐
│                    COMMUNICATION TOPOLOGY                             │
│                                                                        │
│  Frontend ──REST──▶ API Gateway (Traefik)                            │
│                              │                                         │
│              ┌───────────────┼───────────────────────┐               │
│              ▼               ▼                       ▼               │
│  Policy Authoring  ──REST──▶ Policy Validation       Metadata Svc    │
│       Svc          ──REST──▶ User/RBAC Svc                           │
│              │                                                         │
│              └──REST──▶ Enforcement Svc                               │
│                               │                                        │
│                     Temporal Client SDK                                │
│                               │                                        │
│                     Temporal Server (gRPC)                             │
│                               │                                        │
│                    ┌──────────┼──────────┐                            │
│                    ▼          ▼          ▼                            │
│              Snowflake   Redshift    Future-Connector                 │
│              Connector   Connector   (via Task Queue)                 │
│                    │                                                   │
│                    └──────────────── Target Platforms                 │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 API Contracts

**Policy Creation:**
```
POST /api/v1/policies
Authorization: Bearer <keycloak_token>
Content-Type: application/json

Request:
{
  "policy_name": "GL Transaction Access Policy",
  "policy_code": "POL-GL-001",
  "description": "Controls access to GL transaction data",
  "domain_id": 1,
  "product_id": 2,
  "enforce_mode": "ENFORCED",
  "effective_date": "2026-09-01",
  "rules": [
    {
      "rule_name": "Senior Finance Full Access",
      "rule_type": "COMBINED",
      "effect": "ALLOW",
      "subjects": [{"subject_type": "ROLE", "role_id": 6}],
      "conditions": [
        {
          "condition_group": 1,
          "attribute_type": "USER_ATTRIBUTE",
          "attribute_key": "clearance_level",
          "operator": "IN",
          "compare_value_type": "LITERAL",
          "compare_value": "L3,L4,L5"
        }
      ],
      "actions": [{"action_type": "GRANT_SELECT"}],
      "resources": [
        {
          "platform_id": 1,
          "table_id": 5,
          "resource_scope": "TABLE"
        }
      ]
    }
  ],
  "target_platform_ids": [1, 2]
}

Response 201:
{
  "policy_id": 42,
  "version_id": 1,
  "status": "DRAFT",
  "created_at": "2026-08-30T16:30:00Z"
}
```

**Validation Trigger:**
```
POST /api/v1/validate
Content-Type: application/json

Request:
{ "policy_id": 42, "version_id": 1 }

Response 200:
{
  "is_valid": true,
  "validation_timestamp": "2026-08-30T16:30:05Z",
  "checks": [
    {"check": "schema_completeness", "passed": true},
    {"check": "conflict_detection",  "passed": true, "conflicts": []},
    {"check": "rego_evaluation",     "passed": true}
  ]
}
```

**Deployment Trigger:**
```
POST /api/v1/deployments
Content-Type: application/json

Request:
{ "policy_id": 42, "version_id": 1, "target_platform_ids": [1, 2] }

Response 202:
{
  "deployment_id": "dep-88a7f3b2",
  "temporal_workflow_id": "PolicyDeploymentWorkflow-v1-42-1",
  "status": "DEPLOYING",
  "platforms": [
    {"platform_id": 1, "platform_code": "SNOWFLAKE", "status": "PENDING"},
    {"platform_id": 2, "platform_code": "REDSHIFT",  "status": "PENDING"}
  ]
}
```

### 7.3 Decoupling After Deployment

Once policies are pushed to target platforms as native constructs:
1. **Snowflake ROW ACCESS POLICIES** are owned by Snowflake and enforced at query time — independently of our system
2. **Redshift RLS POLICIES** are owned by Redshift cluster — enforce without calling back to our system
3. Our system becomes the **source of truth** for policy intent, but platforms enforce natively
4. Platform teams can manage, audit, and extend policies independently using native tools
5. Our system tracks `deployment_status=SUCCESS` and records the Temporal workflow ID for traceability

---

## 8. Extensibility Strategy

### 8.1 Adding a New Platform (e.g., BigQuery)

**Step 1: Register the platform (no schema change)**
```sql
INSERT INTO metadata_platforms (platform_code, platform_name, platform_version, connection_alias)
VALUES ('BIGQUERY', 'Google BigQuery', '2.x', 'bigquery-prod-acme');
```

**Step 2: Implement the Connector Interface**

All platform connectors must implement this Python abstract interface:

```python
# shared-libs/connector_interface.py

from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class PolicyVersionContext:
    version_id: int
    policy_id: int
    rules: list[PolicyRule]
    platform_id: int

@dataclass
class ApplyResult:
    success: bool
    applied_constructs: list[str]   # names of created platform objects
    error_message: str | None

class PlatformConnector(ABC):
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the target platform is reachable."""
        ...
    
    @abstractmethod
    async def apply_policy(self, ctx: PolicyVersionContext) -> ApplyResult:
        """
        Translate and apply all rules to the target platform.
        Must be idempotent — re-applying an already-applied policy is safe.
        """
        ...
    
    @abstractmethod
    async def revoke_policy(self, ctx: PolicyVersionContext) -> ApplyResult:
        """Remove all constructs created by apply_policy for this version."""
        ...
    
    @abstractmethod
    async def verify_deployment(self, ctx: PolicyVersionContext) -> bool:
        """Query the platform to confirm constructs exist and are active."""
        ...
    
    @abstractmethod
    async def rollback(self, ctx: PolicyVersionContext, prior_version_id: int) -> ApplyResult:
        """Revert to the constructs from prior_version_id."""
        ...
```

**Step 3: Implement the BigQuery Connector**
```
bigquery-connector/
├── src/
│   ├── main.py                        # FastAPI app
│   ├── connector.py                   # Implements PlatformConnector
│   ├── translators/
│   │   ├── row_filter_translator.py   # → BigQuery Row-level security policies
│   │   ├── column_mask_translator.py  # → BigQuery column-level security
│   │   └── iam_translator.py          # → BigQuery IAM bindings
│   └── core/config.py
└── Dockerfile
```

**Step 4: Register connector URL in Enforcement Service**
```python
# enforcement-service/core/config.py
connector_urls: dict[str, str] = {
    "SNOWFLAKE": "http://snowflake-connector:8006",
    "REDSHIFT":  "http://redshift-connector:8007",
    "BIGQUERY":  "http://bigquery-connector:8008",  # ← add this line
}
```

**Step 5: Implement metadata syncer**
```python
# metadata-service/src/services/sync/bigquery_syncer.py
class BigQuerySyncer(BaseSyncer):
    async def sync_databases(self) -> None: ...
    async def sync_schemas(self) -> None: ...
    async def sync_tables(self) -> None: ...
    async def sync_columns(self) -> None: ...
```

> **Zero core service changes required.** The entire extension is contained within the new connector service and a single config line.

---

## 9. Open-Source Technology Recommendations

### 9.1 Policy-as-Code Engine

| Tool | Recommendation | Reason |
|---|---|---|
| **OPA (Open Policy Agent)** | ✅ **Primary Choice** | CNCF project, mature, Rego language is purpose-built for policy evaluation, HTTP API, bundles, watching |
| Cedar | Alternative | AWS open-sourced, excellent for ABAC, but smaller community |
| Casbin | Fallback | Python-native, simpler model, good for RBAC-only use cases |

**OPA deployment:** Run as a sidecar to `policy-validation-service`. Policy bundles compiled from Rego files and pushed to OPA on every validation request. Use OPA's `--bundle` flag for hot-reload.

---

### 9.2 Authentication and Authorization

| Tool | Recommendation |
|---|---|
| **Keycloak 24+** | ✅ **Primary Choice** — LDAP federation, OIDC, SAML, fine-grained authz policies, open-source |
| Authentik | Alternative — modern UI, LDAP sync, good for smaller deployments |
| Ory Hydra + Kratos | Advanced — separate authn/authz, more ops overhead |

**Integration Pattern:**
- Frontend → Keycloak OIDC (Authorization Code + PKCE)
- Services → JWT token introspection or JWKS validation
- LDAP users/groups → Keycloak → sync job → PostgreSQL `users`, `roles` tables

---

### 9.3 Logging and Monitoring

| Component | Tool | Purpose |
|---|---|---|
| **Metrics** | Prometheus + Grafana | Service health, policy deployment latency, error rates |
| **Logs** | Loki + Grafana | Structured JSON log aggregation, queryable |
| **Tracing** | Tempo + OpenTelemetry | Distributed request tracing across microservices |
| **Alerting** | Alertmanager | PagerDuty/Slack routing for deployment failures |
| **Uptime** | Blackbox Exporter | HTTP endpoint monitoring for all services |

**FastAPI OpenTelemetry integration:**
```python
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/metrics")
```

---

### 9.4 Message Queuing (Async Communication)

| Tool | Recommendation |
|---|---|
| **Redis Streams** | ✅ Lightweight choice — for audit event publishing and non-critical async tasks |
| **RabbitMQ** | Alternative — if stronger message durability guarantees needed |
| **Kafka** | Overkill for POC — consider for production scale >10k policies/day |

**Pattern:** Temporal handles all critical async workflow orchestration. Redis Streams handles lightweight event propagation (audit events, notification triggers).

---

### 9.5 Container Orchestration

| Tool | Recommendation |
|---|---|
| **Docker Compose** | ✅ For POC/dev environment (included in this spec) |
| **Kubernetes (K8s) via k3s** | For production — use k3s (lightweight K8s), Helm charts per service |
| **Kustomize** | For K8s environment configuration management |

---

### 9.6 Testing Frameworks

| Service | Unit Testing | Integration Testing | E2E |
|---|---|---|---|
| FastAPI services | `pytest` + `pytest-asyncio` | `httpx` + testcontainers | — |
| OPA/Rego policies | OPA's `opa test` command | — | — |
| Temporal workflows | `temporalio.testing` + pytest | Test Temporal Server | — |
| React frontend | Vitest + Testing Library | MSW (mock API) | Playwright |
| SQL schema | `pgTAP` | Docker PostgreSQL | — |
| Connectors | `pytest` + `unittest.mock` | Snowflake sandbox / Redshift trial | — |

---

### 9.7 Complete Docker Compose (POC)

```yaml
# docker-compose.yml
version: "3.9"

services:
  traefik:
    image: traefik:v3.1
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8090:8080"   # Traefik dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  postgresql:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: immuta_clone
      POSTGRES_USER: immuta
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U immuta"]
      interval: 10s
      retries: 5

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgresql/immuta_clone
      KC_DB_USERNAME: immuta
      KC_DB_PASSWORD: ${PG_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    ports:
      - "8080:8080"
    depends_on:
      postgresql:
        condition: service_healthy

  opa:
    image: openpolicyagent/opa:latest-rootless
    command: run --server --addr :8181 --log-format json /policies
    volumes:
      - ./policy-validation-service/rego:/policies

  temporal:
    image: temporalio/auto-setup:1.24
    environment:
      DB: postgresql
      DB_PORT: 5432
      POSTGRES_USER: immuta
      POSTGRES_PWD: ${PG_PASSWORD}
      POSTGRES_SEEDS: postgresql
    ports:
      - "7233:7233"
    depends_on:
      postgresql:
        condition: service_healthy

  temporal-ui:
    image: temporalio/ui:latest
    environment:
      TEMPORAL_ADDRESS: temporal:7233
    ports:
      - "8088:8080"

  policy-authoring-service:
    build: ./policy-authoring-service
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      KEYCLOAK_URL: http://keycloak:8080
      VALIDATION_SERVICE_URL: http://policy-validation-service:8002
      ENFORCEMENT_SERVICE_URL: http://enforcement-service:8004
    labels:
      - "traefik.http.routers.authoring.rule=PathPrefix(`/api/v1/policies`)"
    depends_on:
      postgresql:
        condition: service_healthy

  policy-validation-service:
    build: ./policy-validation-service
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      OPA_URL: http://opa:8181
    depends_on:
      - opa

  metadata-service:
    build: ./metadata-service
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
    labels:
      - "traefik.http.routers.metadata.rule=PathPrefix(`/api/v1/metadata`)"

  enforcement-service:
    build: ./enforcement-service
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      TEMPORAL_HOST: temporal:7233
      SNOWFLAKE_CONNECTOR_URL: http://snowflake-connector:8006
      REDSHIFT_CONNECTOR_URL: http://redshift-connector:8007
    depends_on:
      - temporal

  user-rbac-service:
    build: ./user-rbac-service
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      KEYCLOAK_URL: http://keycloak:8080
    labels:
      - "traefik.http.routers.rbac.rule=PathPrefix(`/api/v1/users,/api/v1/roles`)"

  snowflake-connector:
    build: ./snowflake-connector
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      SNOWFLAKE_ACCOUNT: ${SNOWFLAKE_ACCOUNT}
      SNOWFLAKE_USER: ${SNOWFLAKE_USER}
      SNOWFLAKE_PASSWORD: ${SNOWFLAKE_PASSWORD}
      SNOWFLAKE_WAREHOUSE: ${SNOWFLAKE_WAREHOUSE}

  redshift-connector:
    build: ./redshift-connector
    environment:
      DATABASE_URL: postgresql+asyncpg://immuta:${PG_PASSWORD}@postgresql/immuta_clone
      REDSHIFT_HOST: ${REDSHIFT_HOST}
      REDSHIFT_PORT: 5439
      REDSHIFT_DB: ${REDSHIFT_DB}
      REDSHIFT_USER: ${REDSHIFT_USER}
      REDSHIFT_PASSWORD: ${REDSHIFT_PASSWORD}

  frontend-service:
    build: ./frontend-service
    labels:
      - "traefik.http.routers.frontend.rule=PathPrefix(`/`)"
    depends_on:
      - policy-authoring-service

  prometheus:
    image: prom/prometheus:v2.53
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:11.1
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"

  loki:
    image: grafana/loki:3.1
    ports:
      - "3100:3100"

volumes:
  pg_data:
  grafana_data:
```

---

## Appendix A: Recommended Repository Structure

```
immuta-clone/
├── README.md
├── docker-compose.yml
├── docker-compose.override.yml        # local dev overrides
├── .env.example
├── CONTRIBUTING.md
├── docs/
│   ├── architecture/
│   ├── api-contracts/
│   └── runbooks/
├── infrastructure/
│   ├── terraform/                     # optional: cloud infra
│   ├── k8s/                           # Kubernetes manifests
│   └── monitoring/
│       ├── prometheus.yml
│       ├── grafana-dashboards/
│       └── loki-config.yml
├── shared-libs/
│   ├── connector_interface.py         # Abstract connector base
│   ├── policy_models.py               # Shared Pydantic models
│   └── auth_middleware.py             # JWT validation helper
├── policy-authoring-service/
├── policy-validation-service/
│   └── rego/                          # OPA Rego policies
├── metadata-service/
├── enforcement-service/
├── user-rbac-service/
├── snowflake-connector/
├── redshift-connector/
├── frontend-service/
└── database/
    ├── migrations/                    # Alembic or Flyway migrations
    └── seeds/                         # Sample data SQL files
```

---

## Appendix B: Implementation Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| **Phase 0: Infrastructure** | Week 1-2 | Docker Compose, PostgreSQL schema, Keycloak setup, Temporal server |
| **Phase 1: Core Services** | Week 3-5 | Policy Authoring Service, User/RBAC Service, Metadata Service, basic React UI |
| **Phase 2: Validation** | Week 6-7 | OPA integration, Validation Service, Rego policy authoring |
| **Phase 3: Enforcement** | Week 8-10 | Temporal workflow, Snowflake Connector, Redshift Connector |
| **Phase 4: UI Polish** | Week 11-12 | Full Policy Studio UI, Audit Dashboard, Deployment Tracker |
| **Phase 5: Observability** | Week 13 | Prometheus, Grafana, Loki, alerting |
| **Phase 6: Testing + Hardening** | Week 14-15 | Integration tests, E2E tests, security review |

---

*Document generated for POC implementation. All tools listed are open-source. No proprietary dependencies.*
