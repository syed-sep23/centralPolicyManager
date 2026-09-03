# Central Entitlement Service (CES) — Database Scripts & Schema Guide

This directory contains the PostgreSQL DDL schema definition scripts and sample seed data for the **Central Entitlement Service (CES)** system (CES Clone).

---

## 📁 Directory Structure

```text
database/
├── schema/
│   ├── 001_core_domain.sql    # Core tables: Users, Roles, User-Roles, Projects, Project-Members
│   ├── 002_metadata.sql       # Data Catalog: Data Sources, Schemas, Tables, Columns
│   └── 003_policies.sql       # Policy Engine: Masking Policies, Row-Level Security, Rules, Auditing
└── seeds/
    └── 004_sample_data.sql    # Sample Seed Data for testing and development
```

---

## 📜 Execution Order & Script Details

### 1. Schema Scripts (`database/schema/`)

| Order | Script File | Description | Key Tables Created |
|---|---|---|---|
| **1** | [`001_core_domain.sql`](file:///d:/project/Central%20Entitlement%20Service/centralPolicyManager/database/schema/001_core_domain.sql) | Identity & Access Management core models, ABAC user attributes, group attributes | `organizations`, `data_domains`, `data_products`, `roles`, `users`, `user_role_mappings`, `user_attributes`, `group_attributes`, `permissions`, `role_permissions` |
| **2** | [`002_metadata.sql`](file:///d:/project/Central%20Entitlement%20Service/centralPolicyManager/database/schema/002_metadata.sql) | Data Catalog, Cloud Platforms, Hierarchical Taxonomy Tags & Assignments | `metadata_platforms`, `metadata_databases`, `metadata_schemas`, `metadata_tables`, `metadata_columns`, `metadata_tags`, `metadata_tag_assignments`, `data_product_table_mappings`, `platform_role_mappings` |
| **3** | [`003_policies.sql`](file:///d:/project/Central%20Entitlement%20Service/centralPolicyManager/database/schema/003_policies.sql) | PBAC Purposes, Access Requests, Policy Engine AST & Audit Trail | `purposes`, `user_purposes`, `data_access_requests`, `abac_attribute_groups`, `policies`, `policy_versions`, `policy_rules`, `policy_rule_subjects`, `policy_rule_resources`, `policy_rule_actions`, `policy_rule_conditions`, `policy_version_targets`, `audit_events` |

### 2. Seed Scripts (`database/seeds/`)

| Script File | Description | Populated Data |
|---|---|---|
| [`004_sample_data.sql`](file:///d:/project/Central%20Entitlement%20Service/centralPolicyManager/database/seeds/004_sample_data.sql) | Complete enterprise seed data for fresh deployments | 7 users, 13 roles, user & group ABAC attributes, 6 PBAC purposes, user authorizations, 5 access requests, 2 platforms (Snowflake/Redshift), 10 tables, 76 columns, 29 hierarchical taxonomy tags, 20 tag assignments, 3 active policies, targets, and auto-increment sequence advancement |


---

## 🚀 How to Run the Database Scripts

### Method A: Automated PowerShell Script

Run the following commands in PowerShell from the repository root:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\psql.exe"
$dbUser = "postgres"
$dbName = "ces_db"

# 1. Create Database
& $psql -h localhost -p 5432 -U $dbUser -c "CREATE DATABASE ces_db;"

# 2. Apply Schema Scripts
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\001_core_domain.sql"
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\002_metadata.sql"
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\003_policies.sql"

# 3. Apply Seed Data
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\seeds\004_sample_data.sql"
```

---

### Method B: Docker Compose (Automated on Container Startup)

When starting the stack with Docker Compose, the PostgreSQL container automatically mounts and executes all `.sql` files in `./database/schema` upon first initialization:

```bash
docker compose up -d postgresql
```

---

## 🔧 Database Connection Configuration

Ensure your [`.env`](file:///d:/project/Central%20Entitlement%20Service/centralPolicyManager/.env) file matches your PostgreSQL database credentials:

```env
DATABASE_URL=postgresql+asyncpg://ces_user:ces_secret_2024@localhost:5432/ces_db
PG_PASSWORD=ces_secret_2024
```
