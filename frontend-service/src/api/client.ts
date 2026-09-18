import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
)

export default api

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/token', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  me: () => api.get('/auth/me'),
  register: (data: { username: string; email: string; password: string; display_name?: string }) =>
    api.post('/auth/register', data),
}

// ─── Policies ─────────────────────────────────────────────────────────────────
export const policiesApi = {
  list: (params?: { page?: number; size?: number; status?: string; domain_id?: number }) =>
    api.get('/policies', { params }),
  get: (id: number)  => api.get(`/policies/${id}`),
  create: (data: unknown) => api.post('/policies', data),
  previewCompile: (data: unknown) => api.post('/policies/preview-compile', data),
  update: (id: number, data: unknown) => api.put(`/policies/${id}`, data),
  submit: (id: number) => api.post(`/policies/${id}/submit`),
  rollback: (id: number, toVersion: number) =>
    api.post(`/policies/${id}/rollback`, null, { params: { to_version: toVersion } }),
  delete: (id: number) => api.delete(`/policies/${id}`),
  versions: (id: number) => api.get(`/policies/${id}/versions`),
  rules: (id: number) => api.get(`/policies/${id}/rules`),
  addRule: (id: number, rule: unknown) => api.post(`/policies/${id}/rules`, rule),
  deleteRule: (policyId: number, ruleId: number) =>
    api.delete(`/policies/${policyId}/rules/${ruleId}`),
}

// ─── Direct Cloud Connectors (Decoupled Microservices via Edge Gateway) ───────
export const connectorApi = {
  testSnowflake: (data: any) =>
    axios.post('/connectors/snowflake/api/v1/test-connection', data),
  testRedshift: (data: any) =>
    axios.post('/connectors/redshift/api/v1/test-connection', data),
  compileSnowflake: (rawPayload: any) =>
    axios.post('/connectors/snowflake/api/v1/compile', rawPayload),
  compileRedshift: (rawPayload: any) =>
    axios.post('/connectors/redshift/api/v1/compile', rawPayload),
}

// ─── Deployments & Compiled Artifacts ─────────────────────────────────────────
export const deploymentsApi = {
  getCompiled: (policyId: number, versionId?: number) =>
    api.get(`/deployments/${policyId}/compiled`, { params: { version_id: versionId } }),
  compiled: (policyId: number, versionId?: number) =>
    api.get(`/deployments/${policyId}/compiled`, { params: { version_id: versionId } }),
  status: (policyId: number, versionId?: number) =>
    api.get(`/deployments/${policyId}/status`, { params: { version_id: versionId } }),
  deploy: (data: { policy_id: number; version_id: number; target_platform_ids?: number[] }) =>
    api.post('/deployments', data),
  trigger: (policyId: number, versionId: number) =>
    api.post('/deployments', { policy_id: policyId, version_id: versionId }),
  getStreamUrl: (eventId: string) =>
    `/api/v1/deployments/stream/${eventId}`,
}
export const deploymentApi = deploymentsApi

// ─── Celery Tasks & Beat Cron History ─────────────────────────────────────────
export const tasksApi = {
  listBeatHistory: (params?: { task_type?: string; limit?: number }) =>
    api.get('/deployments/tasks/history', { params }),
  triggerSyncNow: (platformCodes?: string[]) =>
    api.post('/deployments/tasks/sync-now', null, { params: { platform_codes: platformCodes } }),
}


// ─── Metadata ─────────────────────────────────────────────────────────────────
export const metadataApi = {
  drivers:          () => api.get('/metadata/platforms/drivers'),
  platforms:        () => api.get('/metadata/platforms'),
  platform:         (id: number) => api.get(`/metadata/platforms/${id}`),
  createPlatform:   (data: any) => api.post('/metadata/platforms', data),
  updatePlatform:   (id: number, data: any) => api.put(`/metadata/platforms/${id}`, data),
  testConnectionDirect: async (data: any) => {
    try {
      const res = await api.post('/metadata/platforms/test-connection', data)
      return res.data
    } catch (err: any) {
      // Fallback to direct connector if edge gateway proxy fails
      const type = (data.platform_type || data.platform_code || '').toUpperCase()
      if (type.includes('SNOWFLAKE')) {
        const payload = {
          account_identifier: data.account_identifier,
          warehouse: data.warehouse,
          default_database: data.default_database,
          role: data.role,
          db_user: data.db_user,
          db_password: data.db_password,
        }
        const res = await axios.post('/connectors/snowflake/api/v1/test-connection', payload, { timeout: 25_000 })
        return res.data
      } else if (type.includes('REDSHIFT')) {
        const payload = {
          host: data.host,
          port: data.port ? Number(data.port) : 5439,
          default_database: data.default_database,
          db_user: data.db_user,
          db_password: data.db_password,
        }
        const res = await axios.post('/connectors/redshift/api/v1/test-connection', payload, { timeout: 25_000 })
        return res.data
      }
      throw err
    }
  },
  testConnection:   (data: any) => metadataApi.testConnectionDirect(data),
  deletePlatform:   (id: number) => api.delete(`/metadata/platforms/${id}`),
  syncPlatform:     (id: number) => api.post(`/metadata/platforms/${id}/sync`),
  syncAllPlatforms: () => api.post('/metadata/platforms/sync-all'),
  databases:        (platformId: number) => api.get(`/metadata/platforms/${platformId}/databases`),
  schemas:          (dbId: number) => api.get(`/metadata/databases/${dbId}/schemas`),
  tables:           (schemaId: number) => api.get(`/metadata/schemas/${schemaId}/tables`),
  columns:          (tableId: number) => api.get(`/metadata/tables/${tableId}/columns`),
  tablesByPlatforms: (platformIds: number[]) => api.get('/metadata/tables/by-platforms', { params: { platform_ids: platformIds.join(',') } }),
  columnsByTables:  (tableIds: number[]) => api.get('/metadata/columns/by-tables', { params: { table_ids: tableIds.join(',') } }),
  search:           (q: string, type?: string) => api.get('/metadata/search', { params: { q, type } }),
  // Domains
  domains:          () => api.get('/metadata/domains'),
  createDomain:     (data: any) => api.post('/metadata/domains', data),
  updateDomain:     (id: number, data: any) => api.put(`/metadata/domains/${id}`, data),
  deleteDomain:     (id: number) => api.delete(`/metadata/domains/${id}`),
  // Products
  products:         (domainId?: number) => api.get('/metadata/products', { params: { domain_id: domainId } }),
  createProduct:    (data: any) => api.post('/metadata/products', data),
  updateProduct:    (id: number, data: any) => api.put(`/metadata/products/${id}`, data),
  deleteProduct:    (id: number) => api.delete(`/metadata/products/${id}`),
  // Product ↔ Platform links
  productPlatforms:     (productId: number) => api.get(`/metadata/products/${productId}/platforms`),
  linkProductPlatform:  (productId: number, platformId: number) => api.post(`/metadata/products/${productId}/platforms/${platformId}`),
  unlinkProductPlatform:(productId: number, platformId: number) => api.delete(`/metadata/products/${productId}/platforms/${platformId}`),
  dspmMetrics:      () => api.get('/metadata/dspm/posture-metrics'),
}

// ─── Users, Groups & Immuta ABAC Identity ─────────────────────────────────────
export const rbacApi = {
  users:       (page = 1, size = 50) => api.get('/users', { params: { page, size } }),
  user:        (id: number) => api.get(`/users/${id}`),
  createUser:  (data: unknown) => api.post('/users', data),
  updateUser:  (id: number, data: unknown) => api.put(`/users/${id}`, data),
  userRoles:   (id: number) => api.get(`/users/${id}/roles`),
  userAttrs:   (id: number) => api.get(`/users/${id}/attributes`),
  effectiveAttrs: (id: number) => api.get(`/users/${id}/effective-attributes`),
  upsertAttr:  (id: number, data: unknown) => api.put(`/users/${id}/attributes`, data),
  deleteAttr:  (id: number, key: string) => api.delete(`/users/${id}/attributes/${key}`),
  externalMappings: (id: number) => api.get(`/users/${id}/external-mappings`),
  updateExternalMappings: (id: number, mappings: unknown[]) => api.put(`/users/${id}/external-mappings`, mappings),
  supportedPlatforms: () => api.get('/users/supported-platforms'),
  roles:       () => api.get('/roles'),
  createRole:  (data: unknown) => api.post('/roles', data),
  updateRole:  (id: number, data: unknown) => api.put(`/roles/${id}`, data),
  deleteRole:  (id: number) => api.delete(`/roles/${id}`),
  roleAttrs:   (id: number) => api.get(`/roles/${id}/attributes`),
  upsertRoleAttr: (id: number, data: unknown) => api.put(`/roles/${id}/attributes`, data),
  deleteRoleAttr: (id: number, key: string) => api.delete(`/roles/${id}/attributes/${key}`),
  roleMembers: (id: number) => api.get(`/roles/${id}/members`),
  assignRole:  (data: { user_id: number; role_id: number }) => api.post('/roles/assign', data),
  revokeRole:  (userId: number, roleId: number) =>
    api.delete('/roles/assign', { params: { user_id: userId, role_id: roleId } }),
  syncIdp:     () => api.post('/users/sync-idp'),
}

// ─── Business Personas & Archetypes API ───────────────────────────────────────
export const personasApi = {
  list:         () => api.get('/personas'),
  get:          (id: number) => api.get(`/personas/${id}`),
  create:       (data: unknown) => api.post('/personas', data),
  update:       (id: number, data: unknown) => api.put(`/personas/${id}`, data),
  delete:       (id: number) => api.delete(`/personas/${id}`),
  assignGroups: (personaId: number, roleIds: number[]) =>
    api.post(`/personas/${personaId}/groups`, { role_ids: roleIds }),
  removeGroup:  (personaId: number, roleId: number) =>
    api.delete(`/personas/${personaId}/groups/${roleId}`),
  assignUsers:  (personaId: number, userIds: number[]) =>
    api.post(`/personas/${personaId}/users`, { user_ids: userIds }),
  removeUser:   (personaId: number, userId: number) =>
    api.delete(`/personas/${personaId}/users/${userId}`),
  upsertAttr:   (personaId: number, data: unknown) =>
    api.put(`/personas/${personaId}/attributes`, data),
  deleteAttr:   (personaId: number, key: string) =>
    api.delete(`/personas/${personaId}/attributes/${key}`),
}



// ─── Validation ───────────────────────────────────────────────────────────────
export const validationApi = {
  validate: (policyId: number, versionId: number) =>
    api.post('/validate', { policy_id: policyId, version_id: versionId }),
  simulate: (policyId: number, userId: number, tableId: number) =>
    api.post('/simulate', null, { params: { policy_id: policyId, user_id: userId, table_id: tableId } }),
  getAuditLogs: (policyId: number) => api.get(`/logs/${policyId}`),
}

// ─── Data Entitlement Requests ────────────────────────────────────────────────
export const requestsApi = {
  list: (status?: string) => api.get('/requests', { params: { status } }),
  create: (data: unknown) => api.post('/requests', data),
  approve: (id: number) => api.post(`/requests/${id}/approve`),
  reject: (id: number) => api.post(`/requests/${id}/reject`),
  delete: (id: number) => api.delete(`/requests/${id}`),
}
