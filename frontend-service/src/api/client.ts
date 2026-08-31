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

// ─── Metadata ─────────────────────────────────────────────────────────────────
export const metadataApi = {
  platforms:        () => api.get('/metadata/platforms'),
  databases:        (platformId: number) => api.get(`/metadata/platforms/${platformId}/databases`),
  schemas:          (dbId: number) => api.get(`/metadata/databases/${dbId}/schemas`),
  tables:           (schemaId: number) => api.get(`/metadata/schemas/${schemaId}/tables`),
  columns:          (tableId: number) => api.get(`/metadata/tables/${tableId}/columns`),
  search:           (q: string, type?: string) => api.get('/metadata/search', { params: { q, type } }),
  domains:          () => api.get('/metadata/domains'),
  products:         (domainId?: number) => api.get('/metadata/products', { params: { domain_id: domainId } }),
  tags:             (platformId?: number) => api.get('/metadata/tags', { params: { platform_id: platformId } }),
  attributes:       () => api.get('/metadata/attributes'),
}

// ─── Users & Roles ────────────────────────────────────────────────────────────
export const rbacApi = {
  users:       (page = 1, size = 20) => api.get('/users', { params: { page, size } }),
  user:        (id: number) => api.get(`/users/${id}`),
  userRoles:   (id: number) => api.get(`/users/${id}/roles`),
  userAttrs:   (id: number) => api.get(`/users/${id}/attributes`),
  upsertAttr:  (id: number, data: unknown) => api.put(`/users/${id}/attributes`, data),
  roles:       () => api.get('/roles'),
  assignRole:  (data: { user_id: number; role_id: number }) => api.post('/roles/assign', data),
  revokeRole:  (userId: number, roleId: number) =>
    api.delete('/roles/assign', { params: { user_id: userId, role_id: roleId } }),
}

// ─── Deployments ──────────────────────────────────────────────────────────────
export const deploymentApi = {
  trigger: (policyId: number, versionId: number) =>
    api.post('/deployments', { policy_id: policyId, version_id: versionId }),
  status: (policyId: number) => api.get(`/deployments/${policyId}/status`),
  compiled: (policyId: number, versionId?: number) =>
    api.get(`/deployments/${policyId}/compiled`, { params: { version_id: versionId } }),
}

// ─── Validation ───────────────────────────────────────────────────────────────
export const validationApi = {
  validate: (policyId: number, versionId: number) =>
    api.post('/validate', { policy_id: policyId, version_id: versionId }),
  simulate: (policyId: number, userId: number, tableId: number) =>
    api.post('/simulate', null, { params: { policy_id: policyId, user_id: userId, table_id: tableId } }),
  getAuditLogs: (policyId: number) => api.get(`/logs/${policyId}`),
}
