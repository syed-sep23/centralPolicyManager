import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import AppSidebar from './components/layout/AppSidebar'
import AppHeader from './components/layout/AppHeader'

// Pages (lazy-loaded for performance)
import { lazy, Suspense } from 'react'
import { Center, Loader } from '@mantine/core'

const DashboardPage    = lazy(() => import('./pages/Dashboard/DashboardPage'))
const PoliciesPage     = lazy(() => import('./pages/Policies/PoliciesPage'))
const PolicyStudioPage = lazy(() => import('./pages/Policies/PolicyStudioPage'))
const PolicyDetailPage = lazy(() => import('./pages/Policies/PolicyDetailPage'))
const DataCatalogPage  = lazy(() => import('./pages/DataCatalog/DataCatalogPage'))
const RoleManagerPage  = lazy(() => import('./pages/Roles/RoleManagerPage'))
const DeploymentsPage  = lazy(() => import('./pages/Deployments/DeploymentsPage'))
const RequestsPage     = lazy(() => import('./pages/Requests/SubscriptionRequestsPage'))
const PurposesPage     = lazy(() => import('./pages/Purposes/PurposesPage'))
const PlatformsPage    = lazy(() => import('./pages/Platforms/PlatformsPage'))
const TagsManagementPage = lazy(() => import('./pages/Tags/TagsManagementPage'))

const PageLoader = () => (
  <Center h="100%" py="xl">
    <Loader size="md" type="dots" color="indigo" />
  </Center>
)

export default function App() {
  const [opened, { toggle }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <AppHeader opened={opened} toggle={toggle} />
      </AppShell.Header>

      <AppShell.Navbar>
        <AppSidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"          element={<DashboardPage />} />
            <Route path="/policies"           element={<PoliciesPage />} />
            <Route path="/policies/new"       element={<PolicyStudioPage />} />
            <Route path="/policies/:id/edit"  element={<PolicyStudioPage />} />
            <Route path="/policies/:id"       element={<PolicyDetailPage />} />
            <Route path="/policies/:id/:tab"  element={<PolicyDetailPage />} />
            <Route path="/requests"           element={<RequestsPage />} />
            <Route path="/requests/:tab"      element={<RequestsPage />} />
            <Route path="/purposes"           element={<PurposesPage />} />
            <Route path="/catalog"            element={<DataCatalogPage />} />
            <Route path="/catalog/:tab"       element={<DataCatalogPage />} />
            <Route path="/tags"               element={<TagsManagementPage />} />
            <Route path="/platforms"          element={<PlatformsPage />} />
            <Route path="/roles"              element={<RoleManagerPage />} />
            <Route path="/roles/:tab"         element={<RoleManagerPage />} />
            <Route path="/deployments"        element={<DeploymentsPage />} />
            <Route path="/deployments/:tab"   element={<DeploymentsPage />} />
            <Route path="*"                   element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  )
}
