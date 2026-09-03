import { useState } from 'react'
import {
  Stack, Title, Text, Group, Button, Badge, SimpleGrid,
  Modal, TextInput, Textarea, ActionIcon, Paper, Box, Select,
  NumberInput, Card, Divider, Avatar, Drawer, Table, Tooltip,
} from '@mantine/core'
import {
  IconTarget, IconPlus, IconCheck, IconShieldCheck, IconUsers,
  IconGavel, IconClock, IconTrash, IconUserPlus, IconInfoCircle,
  IconLock,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { purposesApi, rbacApi } from '../../api/client'

export default function PurposesPage() {
  const queryClient = useQueryClient()
  const [modalOpened, setModalOpened] = useState(false)
  const [selectedPurpose, setSelectedPurpose] = useState<any | null>(null)
  const [userDrawerOpened, setUserDrawerOpened] = useState(false)

  // New Purpose Form
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [mandate, setMandate] = useState<string | null>('GDPR_ARTICLE_5')
  const [maxSens, setMaxSens] = useState<string | null>('RESTRICTED')
  const [retentionDays, setRetentionDays] = useState<number | string>(365)

  // Authorize User Form
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const purposesQuery = useQuery({ queryKey: ['purposes'], queryFn: () => purposesApi.list() })
  const allUsersQuery = useQuery({ queryKey: ['users'], queryFn: () => rbacApi.users() })
  const authorizedUsersQuery = useQuery({
    queryKey: ['purpose-users', selectedPurpose?.purpose_id],
    queryFn: () => purposesApi.users(selectedPurpose.purpose_id),
    enabled: !!selectedPurpose?.purpose_id,
  })

  const pList: any[] = purposesQuery.data ?? []
  const userList: any[] = allUsersQuery.data?.data ?? []
  const authUsers: any[] = authorizedUsersQuery.data ?? []

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: any) => purposesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purposes'] })
      notifications.show({ message: 'Purpose created successfully!', color: 'teal', icon: <IconCheck /> })
      setModalOpened(false)
      setCode(''); setName(''); setDesc('')
    },
    onError: (err: any) => {
      notifications.show({ message: err.message, color: 'red' })
    },
  })

  const authorizeUserMutation = useMutation({
    mutationFn: ({ pId, uId }: { pId: number; uId: number }) => purposesApi.authorizeUser(pId, uId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purposes'] })
      queryClient.invalidateQueries({ queryKey: ['purpose-users', selectedPurpose?.purpose_id] })
      setSelectedUserId(null)
      notifications.show({ message: 'User authorized for this purpose', color: 'teal' })
    },
  })

  const revokeUserMutation = useMutation({
    mutationFn: ({ pId, uId }: { pId: number; uId: number }) => purposesApi.revokeUser(pId, uId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purposes'] })
      queryClient.invalidateQueries({ queryKey: ['purpose-users', selectedPurpose?.purpose_id] })
      notifications.show({ message: 'User authorization revoked', color: 'orange' })
    },
  })

  const handleSubmit = () => {
    if (!code || !name) {
      notifications.show({ message: 'Please provide Purpose Code and Name', color: 'red' })
      return
    }
    createMutation.mutate({
      purpose_code: code,
      purpose_name: name,
      description: desc,
      regulatory_mandate: mandate,
      max_sensitivity: maxSens,
      retention_days: Number(retentionDays) || 365,
    })
  }

  const handleOpenUserDrawer = (p: any) => {
    setSelectedPurpose(p)
    setUserDrawerOpened(true)
  }

  return (
    <Stack gap="xl">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Badge color="violet" variant="filled" size="sm">CES PBAC</Badge>
            <Badge color="teal" variant="light" size="sm">Purpose Limitation Framework</Badge>
          </Group>
          <Title order={2} mt={4}>Purpose-Based Access Control (PBAC)</Title>
          <Text c="dimmed" size="sm">
            Enforce context over identity. Grant and restrict data usage based on the specific, contextual purpose behind a user's or tool's request.
          </Text>
        </Box>
        <Button leftSection={<IconPlus size={16} />} color="violet" radius="md" onClick={() => setModalOpened(true)}>
          New Business Purpose
        </Button>
      </Group>

      {/* ── PBAC Concept Architecture Banner ─────────────────────────────────── */}
      <Paper p="md" radius="md" style={{ background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(20, 184, 166, 0.08))', border: '1px solid rgba(124, 58, 237, 0.25)' }}>
        <Group align="flex-start" gap="md">
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'rgba(124, 58, 237, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconGavel size={22} color="var(--mantine-color-violet-4)" />
          </Box>
          <Box style={{ flex: 1 }}>
            <Text fw={700} size="sm" c="violet.4">
              Context Over Identity: Combining PBAC with Dynamic ABAC
            </Text>
            <Text size="xs" c="dimmed" mt={2} style={{ lineHeight: 1.6 }}>
              Under GDPR Article 5(1)(b) and HIPAA 45 CFR § 164.502(b), data collected for one reason cannot be freely queried for another. When querying platforms like Snowflake or Databricks, CES evaluates the active purpose (e.g. <Text span fw={600} c="white">@purpose == 'FRAUD_DETECTION'</Text>) alongside user clearance and data tags to enforce strict purpose limitation automatically.
            </Text>
          </Box>
        </Group>
      </Paper>

      {/* ── Grid of Business Purposes ────────────────────────────────────────── */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {pList.map((p: any) => (
          <Card key={p.purpose_id} p="lg" radius="md" withBorder style={{ position: 'relative' }}>
            <Group justify="space-between" align="flex-start" mb="xs">
              <Group gap="xs">
                <Box
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(124, 58, 237, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconTarget size={20} color="var(--mantine-color-violet-4)" />
                </Box>
                <Box>
                  <Text fw={700} size="sm">{p.purpose_name}</Text>
                  <Badge size="xs" color="violet" variant="outline">{p.purpose_code}</Badge>
                </Box>
              </Group>
            </Group>

            <Text size="xs" c="dimmed" mt="xs" mb="md" style={{ minHeight: 40, lineHeight: 1.5 }}>
              {p.description || 'Approved business purpose for data entitlement and dynamic policy evaluation.'}
            </Text>

            <Divider my="xs" />

            <Stack gap={6} mb="md">
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Regulatory Mandate:</Text>
                <Badge size="xs" color="teal" variant="light">{p.regulatory_mandate || 'GDPR / HIPAA'}</Badge>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Max Data Sensitivity:</Text>
                <Badge size="xs" color={p.max_sensitivity === 'RESTRICTED' ? 'red' : 'indigo'} variant="filled">
                  {p.max_sensitivity || 'RESTRICTED'}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Authorized Retention:</Text>
                <Group gap={4}>
                  <IconClock size={12} color="gray" />
                  <Text size="xs" fw={600}>{p.retention_days || 365} Days</Text>
                </Group>
              </Group>
            </Stack>

            <Button
              variant="light"
              color="violet"
              size="xs"
              fullWidth
              leftSection={<IconUsers size={14} />}
              onClick={() => handleOpenUserDrawer(p)}
            >
              Manage Authorized Users ({p.authorized_users_count || 0})
            </Button>
          </Card>
        ))}
      </SimpleGrid>

      {/* ── AUTHORIZED USERS DRAWER ────────────────────────────────────────── */}
      <Drawer
        opened={userDrawerOpened}
        onClose={() => setUserDrawerOpened(false)}
        title={
          <Group gap="xs">
            <IconTarget size={18} color="var(--mantine-color-violet-4)" />
            <Title order={4}>Authorized Users: {selectedPurpose?.purpose_code}</Title>
          </Group>
        }
        position="right"
        size="md"
        padding="md"
      >
        {selectedPurpose && (
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Users granted this purpose are authorized to select it in their query session context or subscription requests to access governed datasets up to <Text span fw={600} c="white">{selectedPurpose.max_sensitivity}</Text> sensitivity.
            </Text>

            {/* Quick Authorize User Input */}
            <Card withBorder p="sm" radius="md">
              <Text size="xs" fw={700} mb="xs">Authorize User for this Purpose</Text>
              <Group gap="xs">
                <Select
                  placeholder="Select User to authorize..."
                  size="xs"
                  data={userList
                    .filter((u) => !authUsers.some((au) => au.user_id === u.user_id))
                    .map((u) => ({ value: String(u.user_id), label: `${u.display_name || u.username} (${u.email})` }))}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  style={{ flex: 1 }}
                />
                <Button
                  size="xs"
                  color="teal"
                  disabled={!selectedUserId}
                  leftSection={<IconUserPlus size={14} />}
                  onClick={() => {
                    if (selectedUserId) {
                      authorizeUserMutation.mutate({
                        pId: selectedPurpose.purpose_id,
                        uId: Number(selectedUserId),
                      })
                    }
                  }}
                >
                  Authorize
                </Button>
              </Group>
            </Card>

            {/* Active Authorized Users List */}
            <Box>
              <Title order={5} mb="xs">Authorized Accounts ({authUsers.length})</Title>
              {authorizedUsersQuery.isLoading ? (
                <Text size="xs" c="dimmed">Loading authorized users...</Text>
              ) : authUsers.length === 0 ? (
                <Text size="xs" c="dimmed">No users currently authorized for this purpose.</Text>
              ) : (
                <Table highlightOnHover verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User</Table.Th>
                      <Table.Th>Department</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {authUsers.map((u: any) => (
                      <Table.Tr key={u.user_id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Avatar size="sm" color="violet" radius="xl">
                              {(u.display_name || u.username)[0].toUpperCase()}
                            </Avatar>
                            <Box>
                              <Text size="xs" fw={600}>{u.display_name || u.username}</Text>
                              <Text size="10px" c="dimmed">{u.email}</Text>
                            </Box>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{u.department || 'Engineering'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            size="xs"
                            variant="subtle"
                            onClick={() => revokeUserMutation.mutate({
                              pId: selectedPurpose.purpose_id,
                              uId: u.user_id,
                            })}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Box>
          </Stack>
        )}
      </Drawer>

      {/* ── CREATE PURPOSE MODAL ───────────────────────────────────────────── */}
      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title={<Title order={4}>Create New Business Purpose</Title>} radius="md">
        <Stack gap="sm">
          <TextInput
            label="Purpose Code"
            placeholder="e.g. FRAUD_DETECTION"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          />
          <TextInput
            label="Purpose Name"
            placeholder="e.g. Fraud & Anti-Money Laundering Detection"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Regulatory Mandate (Compliance Scope)"
            data={[
              { value: 'GDPR_ARTICLE_5', label: 'GDPR Article 5(1)(b) Purpose Limitation' },
              { value: 'GDPR_ARTICLE_6', label: 'GDPR Article 6(1)(a/b) Consent / Contract' },
              { value: 'HIPAA_MINIMUM_NECESSARY', label: 'HIPAA 45 CFR § 164.502(b) Minimum Necessary' },
              { value: 'SOX_SEC_AUDIT', label: 'SOX 404 / SEC Financial Audit' },
              { value: 'AML_BSA_REGULATION', label: 'Bank Secrecy Act / AML Compliance' },
              { value: 'PCI_DSS_SECURITY', label: 'PCI-DSS Cardholder Data Protection' },
            ]}
            value={mandate}
            onChange={setMandate}
          />
          <Select
            label="Maximum Allowed Data Sensitivity"
            data={[
              { value: 'RESTRICTED', label: 'RESTRICTED (Highest - PII, Financials, Health)' },
              { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL (Internal Customer Data)' },
              { value: 'INTERNAL', label: 'INTERNAL (Employee & Operational Analytics)' },
              { value: 'PUBLIC', label: 'PUBLIC (Public Catalog Assets)' },
            ]}
            value={maxSens}
            onChange={setMaxSens}
          />
          <NumberInput
            label="Authorized Data Retention (Days)"
            value={retentionDays}
            onChange={setRetentionDays}
            min={1}
            max={3650}
          />
          <Textarea
            label="Purpose Description"
            placeholder="Detailed rationale, authorized query types, and compliance boundaries..."
            minRows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalOpened(false)}>Cancel</Button>
            <Button
              color="violet"
              loading={createMutation.isPending}
              disabled={!code.trim() || !name.trim()}
              onClick={handleSubmit}
            >
              Create Business Purpose
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
