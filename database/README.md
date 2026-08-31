# Central Policy Management (CPM) — Database Scripts & Schema Guide

This directory contains the PostgreSQL DDL schema definition scripts and sample seed data for the **Central Policy Management (CPM)** system (Immuta Clone).

---

## 📁 Directory Structure

```text
database/
├── schema/
│   ├── 001_core_domain.sql    # Core tables: Users, Roles, User-Roles, Projects, Project-Members
│   ├── 002_metadata.sql       # Data Catalog: Data Sources, Schemas, Tables, Columns
│   └── 003_policies.sql       # Policy Engine: Masking Policies, Row-Level Security, Rules, Auditing
└── seeds/
    └── 001_sample_data.sql    # Sample Seed Data for testing and development
```

---

## 📜 Execution Order & Script Details

### 1. Schema Scripts (`database/schema/`)

| Order | Script File | Description | Key Tables Created |
|---|---|---|---|
| **1** | [`001_core_domain.sql`](file:///d:/project/Immuta_Clone/database/schema/001_core_domain.sql) | Identity & Access Management core models | `users`, `roles`, `user_roles`, `projects`, `project_members` |
| **2** | [`002_metadata.sql`](file:///d:/project/Immuta_Clone/database/schema/002_metadata.sql) | Data Catalog & Metadata models | `data_sources`, `data_tables`, `data_columns`, `tag_definitions`, `object_tags` |
| **3** | [`003_policies.sql`](file:///d:/project/Immuta_Clone/database/schema/003_policies.sql) | Policy Enforcement & Audit Trail | `policies`, `policy_rules`, `policy_applications`, `audit_logs`, `policy_change_history` |

### 2. Seed Scripts (`database/seeds/`)

| Script File | Description | Populated Data |
|---|---|---|
| [`001_sample_data.sql`](file:///d:/project/Immuta_Clone/database/seeds/001_sample_data.sql) | Sample setup for local dev | Admin/Data Engineer users, Snowflake & Redshift data sources, Customer & Transaction tables with tags, Masking policies |

---

## 🚀 How to Run the Database Scripts

### Method A: Automated PowerShell Script

Run the following commands in PowerShell from the repository root:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\psql.exe"
$dbUser = "postgres"
$dbName = "cpm_db"

# 1. Create Database
& $psql -h localhost -p 5432 -U $dbUser -c "CREATE DATABASE cpm_db;"

# 2. Apply Schema Scripts
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\001_core_domain.sql"
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\002_metadata.sql"
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\schema\003_policies.sql"

# 3. Apply Seed Data
& $psql -h localhost -p 5432 -U $dbUser -d $dbName -f "database\seeds\001_sample_data.sql"
```

---

### Method B: Docker Compose (Automated on Container Startup)

When starting the stack with Docker Compose, the PostgreSQL container automatically mounts and executes all `.sql` files in `./database/schema` upon first initialization:

```bash
docker compose up -d postgresql
```

---

## 🔧 Database Connection Configuration

Ensure your [`.env`](file:///d:/project/Immuta_Clone/.env) file matches your PostgreSQL database credentials:

```env
DATABASE_URL=postgresql+asyncpg://cpm_user:cpm_secret_2024@localhost:5432/cpm_db
PG_PASSWORD=cpm_secret_2024
```
