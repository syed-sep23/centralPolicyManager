# Central Entitlement Service (CES)

> **An open-source central entitlement service and data access governance platform** built with FastAPI, React + Mantine UI, OPA, Temporal, and PostgreSQL.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-green.svg)](https://python.org)
[![React 18](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev)

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose v2)
- Ports 80, 8000, 5433, 7233, 8088, 8181 available

### 1. Clone and configure
```bash
git clone <repo-url>
cd CES
cp .env.example .env
```

### 2. Start all services
```bash
docker compose up -d --build
```

### 3. Access the services

| Service | URL / Port | Description |
|---|---|---|
| **CES Portal UI** | http://localhost | React frontend (Nginx proxy) |
| **Core API Docs** | http://localhost:8000/docs | FastAPI Swagger UI |
| **Temporal UI** | http://localhost:8088 | Workflow management |
| **OPA** | http://localhost:8181 | Policy engine |
| **PostgreSQL** | `127.0.0.1:5433` | Primary Database (`ces_user` / `ces_secret_2024`) |

### 4. Login Credentials
Default login credentials for POC mode:
- **Username**: `admin`
- **Password**: `admin`

---

## 🐳 Complete Docker Cheat Sheet & Helper Commands

### Service Port Reference

| Service Name | Docker Container Name | Host Port | Description |
|---|---|---|---|
| **CES Portal UI** | `ces-frontend` | `http://localhost:80` | React Frontend Application |
| **Core API Backend** | `ces-backend-service` | `http://localhost:8000` | FastAPI Backend (Docs: `/docs`) |
| **PostgreSQL Database** | `ces-postgres` | `127.0.0.1:5433` | Primary Database (`ces_db`) |
| **Open Policy Agent** | `ces-opa` | `http://localhost:8181` | Rego Policy Engine |
| **Temporal Engine** | `ces-temporal` | `localhost:7233` | Workflow Orchestration Engine |
| **Temporal Web UI** | `ces-temporal-ui` | `http://localhost:8088` | Workflow Monitoring Dashboard |
| **Snowflake Connector** | `ces-snowflake-connector` | Internal (`8006`) | Snowflake Connector Service |
| **Redshift Connector** | `ces-redshift-connector` | Internal (`8007`) | Redshift Connector Service |

---

### 1. Manage ALL Containers (Full Application Stack)

| Action | Command | Description |
|---|---|---|
| **Start all services** | `docker compose up -d` | Starts all 8 stack containers in the background. |
| **Build & start all** | `docker compose up -d --build` | Rebuilds Docker images and starts all services cleanly. |
| **Stop all services** | `docker compose stop` | Gracefully stops all running containers without deleting them. |
| **Stop & remove all** | `docker compose down` | Stops and removes all containers and networks. |
| **Restart all services**| `docker compose restart` | Restarts all running stack containers. |
| **Check container status**| `docker compose ps` | Displays the status and health check state of all containers. |

---

### 2. Manage INDIVIDUAL Containers

*Available Service Names*: `backend-service`, `frontend-service`, `postgresql`, `opa`, `temporal`, `temporal-ui`, `snowflake-connector`, `redshift-connector`.

| Action | Command Example | Description |
|---|---|---|
| **Start single service** | `docker compose start backend-service` | Starts an individual stopped container. |
| **Stop single service** | `docker compose stop backend-service` | Gracefully stops an individual container. |
| **Restart single service** | `docker compose restart backend-service` | Restarts a single container without rebuilding. |
| **Rebuild & restart service**| `docker compose up -d --build backend-service` | Rebuilds image and replaces a single container. |

---

### 3. View Logs for All & Individual Containers
## docker logs -f ces-opa

| Action | Command Example | Description |
|---|---|---|
| **Stream logs for ALL services** | `docker compose logs -f` | Tail and follow live stdout/stderr output across all containers. |
| **Stream logs for 1 service** | `docker compose logs -f backend-service` | Live follow output for a specific container service. |
| **View last N lines for container** | `docker logs ces-backend-service --tail 100` | View the last 100 log lines of a specific container. |
| **View logs with timestamps** | `docker compose logs -f --timestamps backend-service` | Include UTC timestamps in log outputs. |

---

### 4. Database Access & Container Execution

| Action | Command Example | Description |
|---|---|---|
| **Connect to PostgreSQL in container** | `docker exec -it ces-postgres psql -U ces_user -d ces_db` | Interactive `psql` shell inside PostgreSQL container. |
| **Shell inside backend container** | `docker exec -it ces-backend-service sh` | Open interactive shell inside backend container context. |
| **Load sample seed data** | `Get-Content database/seeds/001_sample_data.sql -Raw \| docker exec -i ces-postgres psql -U ces_user -d ces_db` | Manually run seed data into database. |

---

## 🏗️ Architecture

```
Frontend (React + Mantine UI)
    ↓ Direct HTTP /api proxy
┌─────────────────────────────────────────────────────────┐
│ Core Backend Service (FastAPI :8000)                   │
│  - Auth, Policies, Rules, Validation, Metadata, RBAC   │
│  - Temporal Worker & Workflow Dispatch                 │
└─────────────────────────────────────────────────────────┘
    ↓ SQL               ↓ Evaluate Rego       ↓ Workflows
PostgreSQL 16         Open Policy Agent     Temporal Server
    ↓ Direct HTTP
┌────────────────────┐  ┌────────────────────┐
│ Snowflake Connector│  │ Redshift Connector │
│ (:8006)            │  │ (:8007)            │
└────────────────────┘  └────────────────────┘
```

---

## 📜 License

MIT License.
