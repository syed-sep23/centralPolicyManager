import { useState } from 'react'
import {
  Stack, Title, Text, Group, Button, Badge, Card, SimpleGrid, Modal,
  TextInput, Select, PasswordInput, NumberInput, Paper, ActionIcon, Tooltip,
  SegmentedControl, Box, Alert, Loader, Divider,
} from '@mantine/core'
import {
  IconPlus, IconPlugConnected, IconCheck, IconX,
  IconRefresh, IconEdit, IconTrash, IconBrandAws, IconCloud, IconServer, IconBrandGoogle,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { metadataApi } from '../../api/client'

const PLATFORM_OPTIONS = [
  { value: 'SNOWFLAKE', label: 'Snowflake', icon: IconCloud, color: '#0284c7' },
  { value: 'REDSHIFT', label: 'AWS Redshift', icon: IconBrandAws, color: '#ea580c' },
  { value: 'DATABRICKS', label: 'Databricks', icon: IconServer, color: '#ff3600' },
  { value: 'BIGQUERY', label: 'Google BigQuery', icon: IconBrandGoogle, color: '#4285f4' },
  { value: 'POSTGRESQL', label: 'PostgreSQL', icon: IconDatabase, color: '#336791' },
  { value: 'TRINO', label: 'Trino / Starburst', icon: IconServer, color: '#dd0031' },
  { value: 'CUSTOM_JDBC', label: 'Custom Connector', icon: IconPlugConnected, color: '#4f46e5' },
]

function IconDatabase(props: any) {
  return <IconServer {...props} />
}

export default function PlatformsPage() {
  const queryClient = useQueryClient()
  const [modalOpened, setModalOpened] = useState(false)
  const [editingPlatformId, setEditingPlatformId] = useState<number | null>(null)

  // Driver Selection
  const [platformType, setPlatformType] = useState<string>('SNOWFLAKE')
  const [platformCode, setPlatformCode] = useState('')
  const [platformName, setPlatformName] = useState('')
  const [connectionAlias, setConnectionAlias] = useState('')

  // Connection Parameters
  const [accountIdentifier, setAccountIdentifier] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [defaultDatabase, setDefaultDatabase] = useState('')
  const [role, setRole] = useState('')

  // Host & Port
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number | string>('')
  const [httpPath, setHttpPath] = useState('')
  const [catalogName, setCatalogName] = useState('')

  // Credentials
  const [dbUser, setDbUser] = useState('')
  const [dbPassword, setDbPassword] = useState('')

  // Test Connection status
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null)

  // Queries
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })
  const drivers   = useQuery({ queryKey: ['drivers'], queryFn: () => metadataApi.drivers() })

  const createMutation = useMutation({
    mutationFn: (data: any) => metadataApi.createPlatform(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      notifications.show({ message: 'Platform onboarded successfully!', color: 'teal', icon: <IconCheck /> })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => metadataApi.updatePlatform(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      notifications.show({ message: 'Platform connection updated!', color: 'teal', icon: <IconCheck /> })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => metadataApi.deletePlatform(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      notifications.show({ message: 'Platform disconnected', color: 'orange' })
    },
  })

  const testMutation = useMutation({
    mutationFn: (data: any) => metadataApi.testConnection(data),
    onSuccess: (res: any) => {
      const data = res.data ?? res
      setTestResult(data)
      if (data.status === 'SUCCESS') {
        notifications.show({ message: data.message, color: 'teal', icon: <IconCheck /> })
      } else {
        notifications.show({ message: data.message, color: 'red', icon: <IconX /> })
      }
    },
  })

  const resetForm = () => {
    setEditingPlatformId(null)
    setPlatformCode('')
    setPlatformName('')
    setConnectionAlias('')
    setAccountIdentifier('')
    setWarehouse('')
    setDefaultDatabase('')
    setRole('')
    setHost('')
    setPort('')
    setHttpPath('')
    setCatalogName('')
    setDbUser('')
    setDbPassword('')
    setTestResult(null)
  }

  const closeModal = () => {
    setModalOpened(false)
    resetForm()
  }

  const handleSelectDriver = (driver: string) => {
    setPlatformType(driver)
  }

  const handleOpenCreate = () => {
    resetForm()
    setPlatformType('SNOWFLAKE')
    setModalOpened(true)
  }

  const handleEdit = (p: any) => {
    closeModal()
    setEditingPlatformId(p.platform_id)
    setPlatformCode(p.platform_code)
    setPlatformName(p.platform_name)
    setConnectionAlias(p.connection_alias || '')
    const driver = PLATFORM_OPTIONS.find((o) => p.platform_code.includes(o.value))?.value || 'CUSTOM_JDBC'
    setPlatformType(driver)
    setModalOpened(true)
  }

  const handleTestConnection = () => {
    testMutation.mutate({
      platform_code: platformCode,
      account_identifier: accountIdentifier,
      host,
      port: port ? Number(port) : undefined,
      default_database: defaultDatabase,
      warehouse,
      db_user: dbUser,
      db_password: dbPassword,
    })
  }

  const handleSave = () => {
    if (!platformCode || !platformName) {
      notifications.show({ message: 'Please provide Platform Code and Name', color: 'red' })
      return
    }

    const payload = {
      platform_code: platformCode,
      platform_name: platformName,
      connection_alias: connectionAlias || `${platformCode.toLowerCase()}_conn`,
      account_identifier: accountIdentifier,
      host,
      port: port ? Number(port) : undefined,
      default_database: defaultDatabase,
      warehouse,
      db_user: dbUser,
      db_password: dbPassword,
    }

    if (editingPlatformId) {
      updateMutation.mutate({ id: editingPlatformId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const getList = (res: any) => {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray(res.data)) return res.data
    return []
  }

  const pList = getList(platforms.data)

  const isPlatformCodeValid = platformCode.trim().length >= 2
  const isPlatformNameValid = platformName.trim().length >= 2

  const isDriverConfigValid = () => {
    if (platformType === 'SNOWFLAKE') {
      return Boolean(accountIdentifier.trim() && dbUser.trim() && dbPassword.trim())
    }
    if (platformType === 'REDSHIFT' || platformType === 'POSTGRESQL' || platformType === 'TRINO' || platformType === 'CUSTOM_JDBC') {
      return Boolean(host.trim() && dbUser.trim() && dbPassword.trim())
    }
    if (platformType === 'DATABRICKS') {
      return Boolean(host.trim() && dbUser.trim() && dbPassword.trim())
    }
    if (platformType === 'BIGQUERY') {
      return Boolean(accountIdentifier.trim() && dbUser.trim() && dbPassword.trim())
    }
    return Boolean(dbUser.trim() && dbPassword.trim())
  }

  const isCanTestConnection = isPlatformCodeValid && isDriverConfigValid()
  const isCanSave = isPlatformCodeValid && isPlatformNameValid && isDriverConfigValid()

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Title order={2}>Data Platform Connections</Title>
            <Badge color="indigo" variant="light">Multi-Cloud Driver Registry</Badge>
          </Group>
          <Text c="dimmed" size="sm">
            Onboard, authenticate, test connectivity, and sync database schemas across Snowflake, Redshift, Databricks, BigQuery, PostgreSQL, and Trino.
          </Text>
        </Box>
        <Button leftSection={<IconPlus size={16} />} color="indigo" radius="md" onClick={handleOpenCreate}>
          Onboard Data Platform
        </Button>
      </Group>

      {/* Grid of Platform Connections */}
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {pList.map((p: any) => {
          const opt = PLATFORM_OPTIONS.find((o) => p.platform_code.includes(o.value)) || PLATFORM_OPTIONS[0]
          const IconComp = opt.icon

          return (
            <Paper key={p.platform_id} p="lg" radius="md" withBorder style={{ position: 'relative' }}>
              <Group justify="space-between" align="flex-start" mb="sm">
                <Group gap="sm">
                  <Box
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: 'var(--mantine-color-indigo-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconComp size={22} color={opt.color} />
                  </Box>
                  <Box>
                    <Text fw={700} size="md">{p.platform_name}</Text>
                    <Badge size="xs" color="indigo" variant="outline">
                      {p.platform_code}
                    </Badge>
                  </Box>
                </Group>
                <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
                  Connected
                </Badge>
              </Group>

              <Text size="xs" c="dimmed" mb="md">
                Alias: <Text span ff="monospace" fw={600}>{p.connection_alias || 'default_conn'}</Text> • Native Driver Active
              </Text>

              <Group justify="space-between" mt="md">
                <Button size="xs" variant="light" color="indigo" leftSection={<IconRefresh size={14} />}>
                  Sync Catalog
                </Button>
                <Group gap={6}>
                  <Tooltip label="Edit Connection Credentials">
                    <ActionIcon variant="subtle" color="blue" onClick={() => handleEdit(p)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Disconnect Platform">
                    <ActionIcon variant="subtle" color="red" onClick={() => deleteMutation.mutate(p.platform_id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          )
        })}
      </SimpleGrid>

      {/* Dynamic Driver Onboarding Modal */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingPlatformId ? `Edit Connection: ${platformName}` : 'Onboard Cloud Data Platform'}
        radius="md"
        size="lg"
      >
        <Stack gap="md">
          {!editingPlatformId && (
            <Select
              label="Select Target Platform Driver"
              placeholder="Select Data Engine"
              data={PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={platformType}
              onChange={(val) => val && handleSelectDriver(val)}
            />
          )}

          <Group grow>
            <TextInput
              label="Platform Code"
              placeholder="e.g. SNOWFLAKE_PROD"
              required
              error={!isPlatformCodeValid && platformCode.length > 0 ? 'Platform Code is required (min 2 chars)' : undefined}
              value={platformCode}
              onChange={(e) => setPlatformCode(e.target.value)}
            />
            <TextInput
              label="Platform Display Name"
              placeholder="e.g. Snowflake Production Warehouse"
              required
              error={!isPlatformNameValid && platformName.length > 0 ? 'Display Name is required (min 2 chars)' : undefined}
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
            />
          </Group>

          <Divider label="Driver Parameters" labelPosition="center" my="xs" />

          {/* Dynamic Connection Form Fields */}
          {platformType === 'SNOWFLAKE' && (
            <Stack gap="sm">
              <TextInput
                label="Snowflake Account Identifier"
                placeholder="e.g. xy12345.us-east-1 or orgname-accountname"
                required
                value={accountIdentifier}
                onChange={(e) => setAccountIdentifier(e.target.value)}
              />
              <Group grow>
                <TextInput label="Warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
                <TextInput label="Default Database" value={defaultDatabase} onChange={(e) => setDefaultDatabase(e.target.value)} />
                <TextInput label="Role" value={role} onChange={(e) => setRole(e.target.value)} />
              </Group>
            </Stack>
          )}

          {platformType === 'REDSHIFT' && (
            <Stack gap="sm">
              <Group grow>
                <TextInput label="Cluster Endpoint / Host" placeholder="redshift-cluster.xyz.us-east-1.redshift.amazonaws.com" required value={host} onChange={(e) => setHost(e.target.value)} />
                <NumberInput label="Port" value={port} onChange={setPort} />
              </Group>
              <TextInput label="Database Name" placeholder="dev" value={defaultDatabase} onChange={(e) => setDefaultDatabase(e.target.value)} />
            </Stack>
          )}

          {platformType === 'DATABRICKS' && (
            <Stack gap="sm">
              <TextInput label="Server Hostname" placeholder="dbc-123456.cloud.databricks.com" required value={host} onChange={(e) => setHost(e.target.value)} />
              <TextInput label="HTTP Path" placeholder="/sql/1.0/endpoints/123456" value={httpPath} onChange={(e) => setHttpPath(e.target.value)} />
              <TextInput label="Catalog Name" placeholder="main" value={catalogName} onChange={(e) => setCatalogName(e.target.value)} />
            </Stack>
          )}

          {(platformType === 'POSTGRESQL' || platformType === 'TRINO' || platformType === 'BIGQUERY' || platformType === 'CUSTOM_JDBC') && (
            <Stack gap="sm">
              <Group grow>
                <TextInput label="Host / Project ID" placeholder="db.company.internal" required value={host} onChange={(e) => setHost(e.target.value)} />
                <NumberInput label="Port" value={port} onChange={setPort} />
              </Group>
              <TextInput label="Default Database / Dataset" placeholder="analytics" value={defaultDatabase} onChange={(e) => setDefaultDatabase(e.target.value)} />
            </Stack>
          )}

          <Group grow>
            <TextInput
              label="Authentication User / Service Account"
              placeholder="e.g. CES_GOVERNANCE_USER"
              required
              value={dbUser}
              onChange={(e) => setDbUser(e.target.value)}
            />
            <PasswordInput
              label="Password / Token / Key"
              placeholder="••••••••••••"
              required
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
            />
          </Group>

          {testResult && (
            <Alert
              color={testResult.status === 'SUCCESS' ? 'teal' : 'red'}
              title={testResult.status === 'SUCCESS' ? 'Connection Validated' : 'Connection Failed'}
              icon={testResult.status === 'SUCCESS' ? <IconCheck /> : <IconX />}
            >
              {testResult.message}
            </Alert>
          )}

          <Group justify="space-between" mt="md">
            <Button
              variant="outline"
              color="indigo"
              leftSection={testMutation.isPending ? <Loader size={14} /> : <IconPlugConnected size={16} />}
              onClick={handleTestConnection}
              loading={testMutation.isPending}
              disabled={!isCanTestConnection || testMutation.isPending}
            >
              Test Connection
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={closeModal}>Cancel</Button>
              <Button
                color="indigo"
                loading={createMutation.isPending || updateMutation.isPending}
                onClick={handleSave}
                disabled={!isCanSave || createMutation.isPending || updateMutation.isPending}
              >
                {editingPlatformId ? 'Update Credentials' : 'Save & Onboard Platform'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
