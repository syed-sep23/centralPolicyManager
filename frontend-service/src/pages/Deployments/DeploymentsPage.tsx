import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack,
  Title,
  Text,
  Card,
  Badge,
  Group,
  Box,
  Skeleton,
  Tabs,
  Table,
  Button,
  SimpleGrid,
  Paper,
  Code,
  Tooltip,
  ActionIcon,
  Select,
  Alert,
  CopyButton,
  ThemeIcon,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconRefresh,
  IconClock,
  IconCheck,
  IconX,
  IconPlayerPlay,
  IconCloudCheck,
  IconDatabase,
  IconCopy,
} from '@tabler/icons-react'
import { policiesApi, tasksApi, deploymentsApi } from '../../api/client'

const VALID_DEPLOYMENT_TABS = ['deployments', 'beat-history'] as const
type DeploymentTab = typeof VALID_DEPLOYMENT_TABS[number]

export default function DeploymentsPage() {
  const { tab } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const activeTab: DeploymentTab = useMemo(() => {
    if (tab && (VALID_DEPLOYMENT_TABS as readonly string[]).includes(tab)) {
      return tab as DeploymentTab
    }
    return 'deployments'
  }, [tab])

  useEffect(() => {
    if (tab !== activeTab) {
      navigate(`/deployments/${activeTab}`, { replace: true })
    }
  }, [tab, activeTab, navigate])

  const handleTabChange = (val: string | null) => {
    if (val && (VALID_DEPLOYMENT_TABS as readonly string[]).includes(val)) {
      navigate(`/deployments/${val}`)
    }
  }

  const [platformFilter, setPlatformFilter] = useState<string>('ALL')

  // Query policies for real-time deployment status
  const policiesQuery = useQuery({
    queryKey: ['policies-deployments'],
    queryFn: () => policiesApi.list({ size: 100 }),
  })

  // Query Celery Beat task history from ces_db (loaded on page load)
  const historyQuery = useQuery({
    queryKey: ['celery-task-history'],
    queryFn: () => tasksApi.listBeatHistory({ limit: 50 }),
  })

  // Mutation to trigger manual metadata sync on demand
  const syncMutation = useMutation({
    mutationFn: () => tasksApi.triggerSyncNow(),
    onSuccess: (res: any) => {
      notifications.show({
        title: 'Metadata Sync Dispatched ⚡',
        message: 'Celery worker is now executing the metadata ingestion task.',
        color: 'teal',
      })
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['celery-task-history'] })
      }, 1500)
    },
    onError: (err: any) => {
      notifications.show({
        title: 'Failed to Dispatch Task',
        message: err?.response?.data?.detail || err.message,
        color: 'red',
      })
    },
  })

  const policies = policiesQuery.data?.data?.items ?? []
  const deployedPolicies = policies.filter((p: any) =>
    ['ENFORCED', 'DEPLOYING', 'FAILED', 'PARTIAL_SUCCESS'].includes(p.status)
  )

  const historyItems = historyQuery.data?.data ?? []
  const filteredHistory =
    platformFilter === 'ALL'
      ? historyItems
      : historyItems.filter((h: any) => h.platform_code === platformFilter)

  // Aggregate metrics
  const totalTablesSynced = historyItems.reduce(
    (acc: number, item: any) => acc + (item.tables_synced || 0),
    0
  )
  const totalColumnsSynced = historyItems.reduce(
    (acc: number, item: any) => acc + (item.columns_synced || 0),
    0
  )
  const successfulRuns = historyItems.filter((h: any) => h.status === 'SUCCESS').length

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={2}>Deployments & Task History</Title>
          <Text c="dimmed" size="sm">
            Real-time deployment status across all platforms & Celery Beat scheduled cron jobs
          </Text>
        </Box>
        <Group gap="xs">
          <Button
            variant="light"
            color="violet"
            leftSection={<IconRefresh size={16} />}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['policies-deployments'] })
              queryClient.invalidateQueries({ queryKey: ['celery-task-history'] })
            }}
          >
            Refresh All
          </Button>
          <Button
            variant="filled"
            color="cyan"
            leftSection={<IconPlayerPlay size={16} />}
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            Run Sync Now
          </Button>
        </Group>
      </Group>

      {/* Metric Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Paper className="kpi-card" p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Active Deployments
            </Text>
            <ThemeIcon color="cyan" variant="light" size="md">
              <IconCloudCheck size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700} mt="xs" c="cyan">
            {deployedPolicies.length} Policies
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Pushed to Snowflake & Redshift
          </Text>
        </Paper>

        <Paper className="kpi-card" p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Celery Beat Frequency
            </Text>
            <ThemeIcon color="indigo" variant="light" size="md">
              <IconClock size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700} mt="xs" c="indigo">
            Every 1 Hour
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Scheduled Cron: <Code>0 * * * *</Code>
          </Text>
        </Paper>

        <Paper className="kpi-card" p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Cron Task Runs
            </Text>
            <ThemeIcon color="teal" variant="light" size="md">
              <IconCheck size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700} mt="xs" c="teal">
            {successfulRuns} / {historyItems.length}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Successful sync executions in ces_db
          </Text>
        </Paper>

        <Paper className="kpi-card" p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Catalog Items Synced
            </Text>
            <ThemeIcon color="orange" variant="light" size="md">
              <IconDatabase size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700} mt="xs" c="orange">
            {totalTablesSynced} Tbls / {totalColumnsSynced} Cols
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Extracted from target clouds
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={handleTabChange} variant="outline" radius="md">
        <Tabs.List>
          <Tabs.Tab value="deployments">
            Real-time Platform Deployments ({deployedPolicies.length})
          </Tabs.Tab>
          <Tabs.Tab value="beat-history">
            Celery Beat Tasks History ({historyItems.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* Tab 1: Real-time Deployments Across All Platforms */}
        <Tabs.Panel value="deployments" pt="md">
          <Stack gap="sm">
            {policiesQuery.isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} height={80} radius="md" />)
            ) : deployedPolicies.length === 0 ? (
              <Card className="enterprise-card" p="xl" ta="center">
                <Text c="dimmed">
                  No active policy deployments found. Publish and submit a policy to trigger Celery Worker deployment.
                </Text>
              </Card>
            ) : (
              deployedPolicies.map((p: any) => (
                <Card key={p.policy_id} className="enterprise-card" p="md" radius="md">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Box>
                      <Group gap="xs" mb={4}>
                        <Text fw={600} size="md">
                          {p.policy_name}
                        </Text>
                        <Badge
                          color={
                            p.status === 'ENFORCED'
                              ? 'violet'
                              : p.status === 'DEPLOYING'
                              ? 'yellow'
                              : 'red'
                          }
                          variant="light"
                          size="sm"
                          className={p.status === 'DEPLOYING' ? 'pulse-deploying' : ''}
                        >
                          {p.status}
                        </Badge>
                        <Badge color="gray" variant="outline" size="xs">
                          {p.enforce_mode}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <Code>{p.policy_code}</Code>
                        <Text size="xs" c="dimmed">
                          Version: v{p.current_version_id || 1}.0
                        </Text>
                      </Group>
                    </Box>

                    <Stack align="flex-end" gap={4}>
                      <Group gap="xs">
                        <Badge color="blue" variant="dot" size="xs">
                          SNOWFLAKE (Native Masking)
                        </Badge>
                        <Badge color="red" variant="dot" size="xs">
                          REDSHIFT (DDM & RLS)
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Last Modified: {new Date(p.updated_at || p.created_at).toLocaleString()}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              ))
            )}
          </Stack>
        </Tabs.Panel>

        {/* Tab 2: Celery Beat Tasks History (1-Hour Cron) */}
        <Tabs.Panel value="beat-history" pt="md">
          <Stack gap="md">
            <Alert color="violet" variant="light" title="Celery Beat Background Cron Scheduler">
              Celery Beat runs on an automated 1-hour schedule (<Code>0 * * * *</Code>) using the platform-specific connectors to introspect target databases, extract schemas, tables, and columns, and synchronize metadata into the shared PostgreSQL catalog. Execution history is recorded in <Code>celery_task_history</Code>.
            </Alert>

            <Group justify="space-between">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  Platform Filter:
                </Text>
                <Select
                  size="xs"
                  value={platformFilter}
                  onChange={(val) => setPlatformFilter(val || 'ALL')}
                  data={[
                    { value: 'ALL', label: 'All Platforms' },
                    { value: 'SNOWFLAKE', label: 'Snowflake' },
                    { value: 'REDSHIFT', label: 'Amazon Redshift' },
                  ]}
                  style={{ width: 180 }}
                />
              </Group>
              <Text size="xs" c="dimmed">
                Showing {filteredHistory.length} task runs (stored in shared PostgreSQL database)
              </Text>
            </Group>

            {historyQuery.isLoading ? (
              <Skeleton height={200} radius="md" />
            ) : filteredHistory.length === 0 ? (
              <Card className="enterprise-card" p="xl" ta="center">
                <Text c="dimmed">
                  No task execution history recorded yet. Click "Run Sync Now" to trigger an immediate Celery metadata sync.
                </Text>
              </Card>
            ) : (
              <Paper radius="md" style={{ overflow: 'hidden' }}>
                <Table highlightOnHover striped verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Task ID</Table.Th>
                      <Table.Th>Task Name</Table.Th>
                      <Table.Th>Platform</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Frequency</Table.Th>
                      <Table.Th>Started At</Table.Th>
                      <Table.Th>Duration</Table.Th>
                      <Table.Th>Synced Stats</Table.Th>
                      <Table.Th>Summary / Details</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredHistory.map((item: any) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Group gap={4}>
                            <Code size="xs" color="violet">
                              {item.task_id}
                            </Code>
                            <CopyButton value={item.task_id}>
                              {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied' : 'Copy Task ID'}>
                                  <ActionIcon size="xs" variant="subtle" onClick={copy}>
                                    <IconCopy size={12} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" fw={500}>
                            {item.task_name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="xs"
                            color={
                              item.platform_code === 'SNOWFLAKE'
                                ? 'blue'
                                : item.platform_code === 'REDSHIFT'
                                ? 'red'
                                : 'violet'
                            }
                            variant="light"
                          >
                            {item.platform_code}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="xs"
                            color={
                              item.status === 'SUCCESS'
                                ? 'teal'
                                : item.status === 'RUNNING'
                                ? 'yellow'
                                : 'red'
                            }
                          >
                            {item.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" variant="outline" color="gray">
                            {item.task_type === 'CRON_BEAT' ? '1 Hour Cron' : 'On-Demand'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">
                            {item.started_at ? new Date(item.started_at).toLocaleTimeString() : '—'}
                          </Text>
                          <Text size="10px" c="dimmed">
                            {item.started_at ? new Date(item.started_at).toLocaleDateString() : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" ff="monospace">
                            {item.duration_ms ? `${item.duration_ms} ms` : '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="cyan.4">
                            {item.tables_synced || 0} tbls, {item.columns_synced || 0} cols
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ maxWidth: 300 }}>
                          <Text size="xs" lineClamp={2} c={item.error_message ? 'red.4' : 'dimmed'}>
                            {item.error_message || item.result_summary || 'Task completed successfully'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
