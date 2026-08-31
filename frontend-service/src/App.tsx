import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import AppSidebar from './components/layout/AppSidebar'
import AppHeader from './components/layout/AppHeader'
import { useAuthStore } from './store/authStore'

// Pages (lazy-loaded for performance)
import { lazy, Suspense } from 'react'
import { Center, Loader } from '@mantine/core'

const LoginPage        = lazy(() => import('./pages/Login/LoginPage'))
const DashboardPage    = lazy(() => import('./pages/Dashboard/DashboardPage'))
const PoliciesPage     = lazy(() => import('./pages/Policies/PoliciesPage'))
const PolicyStudioPage = lazy(() => import('./pages/Policies/PolicyStudioPage'))
const PolicyDetailPage = lazy(() => import('./pages/Policies/PolicyDetailPage'))
const DataCatalogPage  = lazy(() => import('./pages/DataCatalog/DataCatalogPage'))
const RoleManagerPage  = lazy(() => import('./pages/Roles/RoleManagerPage'))
const AuditPage        = lazy(() => import('./pages/Audit/AuditPage'))
const DeploymentsPage  = lazy(() => import('./pages/Deployments/DeploymentsPage'))

const PageLoader = () => (
  <Center h="100%"><Loader size="lg" color="violet" /></Center>
)

function ProtectedLayout() {
  const [opened, { toggle }] = useDisclosure()
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header><AppHeader opened={opened} toggle={toggle} /></AppShell.Header>
      <AppShell.Navbar><AppSidebar /></AppShell.Navbar>
      <AppShell.Main>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"          element={<DashboardPage />} />
            <Route path="/policies"           element={<PoliciesPage />} />
            <Route path="/policies/new"       element={<PolicyStudioPage />} />
            <Route path="/policies/:id"       element={<PolicyDetailPage />} />
            <Route path="/policies/:id/edit"  element={<PolicyStudioPage />} />
            <Route path="/catalog"            element={<DataCatalogPage />} />
            <Route path="/roles"              element={<RoleManagerPage />} />
            <Route path="/audit"              element={<AuditPage />} />
            <Route path="/deployments"        element={<DeploymentsPage />} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  )
}

export default function App() {
  const { token } = useAuthStore()

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={token ? <ProtectedLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Suspense>
  )
}
