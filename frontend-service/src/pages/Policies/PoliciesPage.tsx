import { useState, useRef, useEffect } from 'react'
import {
  Stack, Group, Title, Button, Table, Badge, Text, TextInput,
  ActionIcon, Tooltip, Select, Box, Skeleton, Menu,
} from '@mantine/core'
import {
  IconPlus, IconSearch, IconDots, IconEye, IconTrash,
  IconRocket, IconHistory, IconEdit,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { policiesApi } from '../../api/client'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'gray', VALIDATED: 'teal', FAILED_VALIDATION: 'red',
  DEPLOYING: 'yellow', ENFORCED: 'violet', DEPRECATED: 'dark', ROLLBACK: 'orange',
}

function renderOpaStatus(p: any) {
  const status = p.opa_status || p.status
  switch (status) {
    case 'PASSED':
    case 'ENFORCED':
    case 'VALIDATED':
      return <Badge color="teal" variant="light" size="sm">PASSED ✅</Badge>
    case 'REJECTED':
    case 'FAILED_VALIDATION':
      return <Badge color="red" variant="light" size="sm">REJECTED ❌</Badge>
    case 'DEPLOYING':
      return <Badge color="teal" variant="light" size="sm">PASSED ✅</Badge>
    case 'PENDING':
    case 'DRAFT':
    default:
      return <Badge color="gray" variant="outline" size="sm">PENDING</Badge>
  }
}

function renderDeploymentStatus(p: any) {
  const status = p.deployment_status || p.status
  switch (status) {
    case 'ENFORCED':
      return <Badge color="violet" variant="light" size="sm">ENFORCED</Badge>
    case 'DEPLOYING':
      return <Badge color="yellow" variant="light" size="sm" className="pulse-deploying">DEPLOYING</Badge>
    case 'ABORTED':
    case 'FAILED_VALIDATION':
      return <Badge color="red" variant="outline" size="sm">ABORTED</Badge>
    case 'DEPRECATED':
      return <Badge color="dark" variant="light" size="sm">DEPRECATED</Badge>
    case 'ROLLBACK':
      return <Badge color="orange" variant="light" size="sm">ROLLBACK</Badge>
    case 'NOT DEPLOYED':
    case 'DRAFT':
    default:
      return <Badge color="gray" variant="outline" size="sm">NOT DEPLOYED</Badge>
  }
}

export default function PoliciesPage() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // SSE EventSource tracking and cleanup
  const activeEsRef = useRef<EventSource | null>(null)
  const closeActiveEs = () => {
    if (activeEsRef.current) {
      activeEsRef.current.close()
      activeEsRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      closeActiveEs()
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['policies', page, statusFilter],
    queryFn: () => policiesApi.list({ page, size: 20, status: statusFilter ?? undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => policiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      notifications.show({ message: 'Policy deprecated', color: 'teal' })
    },
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => policiesApi.submit(id),
    onSuccess: (res: any) => {
      const eventId = res?.data?.event_id
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      queryClient.invalidateQueries({ queryKey: ['policies-deployments'] })
      notifications.show({
        title: 'OPA Gate Passed ✅',
        message: 'OPA Decision: Positive. Celery worker is deploying policy to platforms...',
        color: 'teal',
      })

      if (eventId) {
        closeActiveEs()
        const es = new EventSource(`/api/v1/deployments/stream/${eventId}`)
        activeEsRef.current = es
        es.addEventListener('deployment_update', (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data)
            if (payload.step === 'COMPLETED') {
              closeActiveEs()
              queryClient.invalidateQueries({ queryKey: ['policies'] })
              queryClient.invalidateQueries({ queryKey: ['policies-deployments'] })
              const taskInfo = payload.celery_task_id ? ` (Celery Task: ${payload.celery_task_id.slice(0, 8)})` : ''
              notifications.show({
                title: 'Policy Deployed Successfully 🚀',
                message: payload.message || `Celery worker${taskInfo} pushed and enforced policy on Snowflake & Redshift!`,
                color: 'teal',
                autoClose: 8000,
              })
            } else if (payload.step === 'FAILED') {
              closeActiveEs()
              queryClient.invalidateQueries({ queryKey: ['policies'] })
              queryClient.invalidateQueries({ queryKey: ['policies-deployments'] })
              notifications.show({
                title: 'Policy Deployment Failed ❌',
                message: payload.message || 'Celery worker encountered an error deploying policy to data platforms.',
                color: 'red',
                autoClose: 10000,
              })
            }
          } catch (err) {
            console.error('SSE event error', err)
          }
        })
        es.addEventListener('timeout', () => closeActiveEs())
        es.addEventListener('error', () => closeActiveEs())
        es.onerror = () => closeActiveEs()
      }
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      const errorMsg = err.response?.data?.detail || 'OPA Policy Evaluation Failed'
      notifications.show({
        title: 'OPA Validation Gate Rejected ❌',
        message: errorMsg,
        color: 'red',
        autoClose: 10000,
      })
    },
  })

  const policies = data?.data?.items ?? []
  const filtered = search
    ? policies.filter((p: any) =>
        p.policy_name.toLowerCase().includes(search.toLowerCase()) ||
        p.policy_code.toLowerCase().includes(search.toLowerCase()))
    : policies

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Box>
          <Title order={2}>Policies</Title>
          <Text c="dimmed" size="sm">Manage access control policies across all platforms</Text>
        </Box>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => navigate('/policies/new')}
          id="create-policy-btn"
          color="indigo"
          variant="filled"
        >
          New Policy
        </Button>
      </Group>

      {/* Filters */}
      <Group gap="sm">
        <TextInput
          placeholder="Search policies..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
          id="policy-search"
        />
        <Select
          placeholder="Filter by status"
          data={['DRAFT','VALIDATED','ENFORCED','DEPLOYING','FAILED_VALIDATION','DEPRECATED']}
          value={statusFilter}
          onChange={setStatusFilter}
          clearable
          w={200}
          id="policy-status-filter"
        />
      </Group>

      {/* Table */}
      <Box style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Policy Name</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Mode</Table.Th>
              <Table.Th>OPA Status</Table.Th>
              <Table.Th>Deployment Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading
              ? [...Array(5)].map((_, i) => (
                  <Table.Tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <Table.Td key={j}><Skeleton height={20} /></Table.Td>
                    ))}
                  </Table.Tr>
                ))
              : filtered.map((p: any) => (
                  <Table.Tr key={p.policy_id} className="fade-in-up">
                    <Table.Td>
                      <Text fw={500} size="sm">{p.policy_name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace" c="dimmed">{p.policy_code}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={p.enforce_mode === 'ENFORCED' ? 'red' : 'gray'} variant="light" size="xs">
                        {p.enforce_mode}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {renderOpaStatus(p)}
                    </Table.Td>
                    <Table.Td>
                      {renderDeploymentStatus(p)}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {new Date(p.created_at).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu shadow="md" width={180}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" id={`policy-menu-${p.policy_id}`}>
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconEye size={14} />}
                            onClick={() => navigate(`/policies/${p.policy_id}`)}>
                            View Detail
                          </Menu.Item>
                          <Menu.Item leftSection={<IconEdit size={14} />}
                            onClick={() => navigate(`/policies/${p.policy_id}/edit`)}>
                            Edit Policy
                          </Menu.Item>
                          <Menu.Item leftSection={<IconRocket size={14} />} color="violet"
                            onClick={() => submitMutation.mutate(p.policy_id)}>
                            {p.status === 'ENFORCED' ? 'Re-Deploy Policy' : 'Submit & Deploy'}
                          </Menu.Item>
                          <Menu.Item leftSection={<IconHistory size={14} />}
                            onClick={() => navigate(`/policies/${p.policy_id}/versions`)}>
                            Version History
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                            onClick={() => deleteMutation.mutate(p.policy_id)}>
                            Deprecate
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
          </Table.Tbody>
        </Table>
        {!isLoading && filtered.length === 0 && (
          <Box py="xl" ta="center">
            <Text c="dimmed">No policies found. Create your first policy to get started.</Text>
          </Box>
        )}
      </Box>
    </Stack>
  )
}
