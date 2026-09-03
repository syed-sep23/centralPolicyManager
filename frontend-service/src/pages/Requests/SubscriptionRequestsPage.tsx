import { useState } from 'react'
import {
  Stack, Title, Text, Group, Button, Badge, Card, Table, Modal,
  Select, TextInput, Textarea, NumberInput, Paper, Tabs, ActionIcon,
  Tooltip, Alert, Box, SegmentedControl, SimpleGrid, ThemeIcon,
} from '@mantine/core'
import {
  IconSend, IconCheck, IconX, IconClock, IconShieldCheck, IconInfoCircle,
  IconPlus, IconLock, IconChecklist, IconTrash, IconTarget, IconDatabase,
  IconUsers, IconShieldX, IconRefresh,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { requestsApi, metadataApi, purposesApi, rbacApi } from '../../api/client'

export default function SubscriptionRequestsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<string | null>('all')
  const [modalOpened, setModalOpened] = useState(false)

  // Form states
  const [targetType, setTargetType] = useState<string>('PRODUCT')
  const [selectedUser, setSelectedUser] = useState<string>('1')
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [durationDays, setDurationDays] = useState<number | string>(30)

  // Data queries: Table filtered list
  const requests = useQuery({
    queryKey: ['requests', activeTab],
    queryFn: () => requestsApi.list(activeTab === 'all' ? undefined : activeTab || undefined),
  })

  // Global query for real overview metrics (independent of table tab filter)
  const allRequestsQuery = useQuery({
    queryKey: ['requests-all-summary'],
    queryFn: () => requestsApi.list(),
  })

  const products = useQuery({ queryKey: ['products'], queryFn: () => metadataApi.products() })
  const purposes = useQuery({ queryKey: ['purposes'], queryFn: () => purposesApi.list() })
  const users = useQuery({ queryKey: ['users'], queryFn: () => rbacApi.users() })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['requests'] })
    queryClient.invalidateQueries({ queryKey: ['requests-all-summary'] })
    queryClient.invalidateQueries({ queryKey: ['requests-pending-count'] })
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => requestsApi.create(data),
    onSuccess: () => {
      invalidateAll()
      notifications.show({ message: 'Entitlement request submitted successfully!', color: 'teal', icon: <IconCheck /> })
      setModalOpened(false)
      setReason('')
      setSelectedProduct(null)
      setSelectedTable(null)
      setSelectedPurpose(null)
    },
    onError: (err: any) => {
      notifications.show({ title: 'Request Failed', message: err.response?.data?.detail || err.message, color: 'red' })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => requestsApi.approve(id),
    onSuccess: () => {
      invalidateAll()
      notifications.show({ message: 'Request approved and entitlement granted!', color: 'teal' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => requestsApi.reject(id),
    onSuccess: () => {
      invalidateAll()
      notifications.show({ message: 'Request rejected', color: 'orange' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => requestsApi.delete(id),
    onSuccess: () => {
      invalidateAll()
      notifications.show({ message: 'Request deleted from audit ledger', color: 'gray' })
    },
  })

  const handleSubmit = () => {
    if (!reason.trim()) {
      notifications.show({ message: 'Please enter a business justification', color: 'red' })
      return
    }
    createMutation.mutate({
      user_id: selectedUser ? parseInt(selectedUser) : 1,
      product_id: targetType === 'PRODUCT' && selectedProduct ? parseInt(selectedProduct) : undefined,
      table_id: targetType === 'TABLE' && selectedTable ? parseInt(selectedTable) : undefined,
      purpose_id: selectedPurpose ? parseInt(selectedPurpose) : undefined,
      reason,
      duration_days: typeof durationDays === 'number' ? durationDays : 30,
    })
  }

  const reqList = requests.data?.data ?? []
  const allRequests: any[] = allRequestsQuery.data?.data ?? []
  const userList: any[] = users.data?.data ?? []
  const productList: any[] = products.data?.data ?? []
  const purposeList: any[] = purposes.data ?? []

  // Real Enterprise Metric Computations
  const activeGrantsCount = allRequests.filter((r: any) => r.status === 'APPROVED').length
  const pendingCount = allRequests.filter((r: any) => r.status === 'PENDING').length
  const rejectedCount = allRequests.filter((r: any) => r.status === 'REJECTED').length
  const uniqueUsersCount = new Set(allRequests.map((r: any) => r.user_id)).size

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Title order={2}>Data Entitlement & Subscription Requests</Title>
            <Badge color="indigo" variant="light">Self-Service Access</Badge>
            <Badge color="violet" variant="outline">PBAC Enforced</Badge>
          </Group>
          <Text c="dimmed" size="sm">
            Request time-bound access to data products and tables with business purpose justification and automated workflow approval.
          </Text>
        </Box>
        <Group gap="xs">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            color="indigo"
            radius="md"
            loading={requests.isFetching || allRequestsQuery.isFetching}
            onClick={() => {
              invalidateAll()
              notifications.show({ message: 'Access requests refreshed', color: 'teal' })
            }}
          >
            Refresh Requests
          </Button>
          <Button leftSection={<IconPlus size={16} />} color="indigo" radius="md" onClick={() => setModalOpened(true)}>
            New Access Request
          </Button>
        </Group>
      </Group>

      {/* Real Enterprise Overview Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">ACTIVE DATA GRANTS</Text>
              <Title order={2} fw={700} mt={2}>{activeGrantsCount}</Title>
              <Text size="xs" c="teal" mt={2} fw={500}>Approved & live in platform</Text>
            </Box>
            <ThemeIcon color="teal" variant="light" size="xl" radius="md">
              <IconShieldCheck size={22} />
            </ThemeIcon>
          </Group>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">PENDING APPROVALS</Text>
              <Title order={2} fw={700} mt={2} c={pendingCount > 0 ? 'yellow.5' : 'white'}>{pendingCount}</Title>
              <Text size="xs" c="dimmed" mt={2} fw={500}>Awaiting security review</Text>
            </Box>
            <ThemeIcon color="yellow" variant="light" size="xl" radius="md">
              <IconClock size={22} />
            </ThemeIcon>
          </Group>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">GOVERNED IDENTITIES</Text>
              <Title order={2} fw={700} mt={2}>{uniqueUsersCount}</Title>
              <Text size="xs" c="indigo" mt={2} fw={500}>Active requestors in directory</Text>
            </Box>
            <ThemeIcon color="indigo" variant="light" size="xl" radius="md">
              <IconUsers size={22} />
            </ThemeIcon>
          </Group>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">REJECTED / CLOSED</Text>
              <Title order={2} fw={700} mt={2}>{rejectedCount}</Title>
              <Text size="xs" c="dimmed" mt={2} fw={500}>Audit log retained</Text>
            </Box>
            <ThemeIcon color="red" variant="light" size="xl" radius="md">
              <IconShieldX size={22} />
            </ThemeIcon>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Tabs & Table */}
      <Card radius="md" withBorder p="md">
        <Tabs value={activeTab} onChange={setActiveTab} mb="md">
          <Tabs.List>
            <Tabs.Tab value="all">All Requests ({allRequests.length})</Tabs.Tab>
            <Tabs.Tab value="PENDING">Pending Approval ({pendingCount})</Tabs.Tab>
            <Tabs.Tab value="APPROVED">Approved Active Grants ({activeGrantsCount})</Tabs.Tab>
            <Tabs.Tab value="REJECTED">Rejected ({rejectedCount})</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User / Requestor</Table.Th>
              <Table.Th>Data Asset / Target</Table.Th>
              <Table.Th>Business Purpose (PBAC)</Table.Th>
              <Table.Th>Justification</Table.Th>
              <Table.Th>Expiration</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reqList.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                  <Text c="dimmed">No entitlement requests found in this view.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              reqList.map((r: any) => (
                <Table.Tr key={r.request_id}>
                  <Table.Td>
                    <Box>
                      <Text size="sm" fw={600}>{r.username}</Text>
                      <Text size="10px" c="dimmed">{r.email}</Text>
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="indigo" variant="light">
                      {r.product_name || r.table_name || 'Enterprise Dataset'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {r.purpose_name ? (
                      <Badge color="violet" variant="outline">
                        {r.purpose_name}
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">General Query</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ maxWidth: 220 }}>
                    <Text size="xs" lineClamp={2}>{r.reason}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '30 Days'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={r.status === 'APPROVED' ? 'teal' : r.status === 'PENDING' ? 'yellow' : 'red'}>
                      {r.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    <Group gap={6} justify="flex-end">
                      {r.status === 'PENDING' && (
                        <>
                          <Tooltip label="Approve Data Access">
                            <ActionIcon color="teal" variant="light" onClick={() => approveMutation.mutate(r.request_id)}>
                              <IconCheck size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Reject Request">
                            <ActionIcon color="red" variant="light" onClick={() => rejectMutation.mutate(r.request_id)}>
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip label="Delete Request">
                        <ActionIcon color="gray" variant="subtle" onClick={() => deleteMutation.mutate(r.request_id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* New Request Modal */}
      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title={<Title order={4}>New Self-Service Data Entitlement Request</Title>} radius="md">
        <Stack gap="md">
          <Select
            label="Requestor User"
            data={userList.map((u: any) => ({ value: String(u.user_id), label: `${u.display_name || u.username} (${u.email})` }))}
            value={selectedUser}
            onChange={(val) => val && setSelectedUser(val)}
          />

          <Box>
            <Text size="xs" fw={500} mb={4}>Target Asset Scope</Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={targetType}
              onChange={setTargetType}
              data={[
                { value: 'PRODUCT', label: 'Data Product' },
                { value: 'PURPOSE_ONLY', label: 'Purpose Authorization' },
              ]}
            />
          </Box>

          {targetType === 'PRODUCT' && (
            <Select
              label="Data Product"
              placeholder="Select Target Data Product"
              data={productList.map((p: any) => ({ value: String(p.product_id), label: `${p.product_name} (${p.domain_name || 'Core Domain'})` }))}
              value={selectedProduct}
              onChange={setSelectedProduct}
              clearable
            />
          )}

          <Select
            label="Business Purpose (PBAC Compliance Scope)"
            placeholder="Select Contextual Purpose (Optional)"
            data={purposeList.map((p: any) => ({ value: String(p.purpose_id), label: `${p.purpose_name} (${p.purpose_code})` }))}
            value={selectedPurpose}
            onChange={setSelectedPurpose}
            clearable
          />

          <NumberInput
            label="Requested Access Duration (Days)"
            value={durationDays}
            onChange={setDurationDays}
            min={1}
            max={365}
          />

          <Textarea
            label="Business Justification"
            placeholder="Explain why access is required for your project or compliance mandate..."
            required
            error={reason.length > 0 && reason.trim().length < 5 ? 'Justification must be at least 5 characters' : undefined}
            minRows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalOpened(false)}>Cancel</Button>
            <Button
              color="indigo"
              leftSection={<IconSend size={16} />}
              loading={createMutation.isPending}
              disabled={reason.trim().length < 5 || createMutation.isPending}
              onClick={handleSubmit}
            >
              Submit Request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
