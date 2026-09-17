import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, Title, Text, Card, Table, Badge, Group, Avatar, Box, Skeleton,
  Tabs, Button, Modal, TextInput, Select, MultiSelect, Switch, Grid, SimpleGrid, Paper, ThemeIcon,
  Drawer, Divider, Alert, Tooltip, ActionIcon, ScrollArea, Code,
} from '@mantine/core'
import {
  IconUsers, IconFolder, IconPlus, IconRefresh, IconCheck, IconTrash,
  IconKey, IconShieldCheck, IconId, IconLayersLinked, IconArrowRight,
  IconUserPlus, IconFolderPlus, IconInfoCircle, IconTag, IconEdit,
  IconCloud, IconBrandAws, IconServer, IconBrandGoogle, IconWorld,
  IconCalendar, IconClock, IconDeviceDesktop, IconUserCheck, IconSearch, IconX,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { rbacApi } from '../../api/client'

const VALID_ROLE_TABS = ['users', 'personas', 'groups'] as const
type RoleTab = typeof VALID_ROLE_TABS[number]

export const SUPPORTED_PLATFORMS_CONFIG = [
  { code: 'SNOWFLAKE', name: 'Snowflake Data Cloud', icon: IconCloud, color: 'blue', placeholder: 'e.g. USERNAME_SF or corp_sf_id' },
  { code: 'REDSHIFT', name: 'Amazon Redshift', icon: IconBrandAws, color: 'orange', placeholder: 'e.g. awsuser or redshift_user_id' },
  { code: 'DATABRICKS', name: 'Databricks Unity Catalog', icon: IconServer, color: 'red', placeholder: 'e.g. user@databricks.corp' },
  { code: 'BIGQUERY', name: 'Google Cloud BigQuery', icon: IconBrandGoogle, color: 'teal', placeholder: 'e.g. user@project.iam.gserviceaccount.com' },
  { code: 'POSTGRESQL', name: 'PostgreSQL Database', icon: IconServer, color: 'cyan', placeholder: 'e.g. pg_username' },
  { code: 'TRINO', name: 'Trino / Starburst Galaxy', icon: IconServer, color: 'pink', placeholder: 'e.g. trino_user_id' },
  { code: 'CUSTOM_JDBC', name: 'Enterprise Generic JDBC', icon: IconDeviceDesktop, color: 'indigo', placeholder: 'e.g. jdbc_external_id' },
]

export default function RoleManagerPage() {
  const { tab } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const activeTab: RoleTab = useMemo(() => {
    if (tab) {
      if (tab === 'personas' || tab === 'persona') return 'personas'
      if (tab === 'groups' || tab === 'identity-groups') return 'groups'
      if (tab === 'users') return 'users'
    }
    return 'users'
  }, [tab])

  useEffect(() => {
    if (tab !== activeTab) {
      navigate(`/roles/${activeTab}`, { replace: true })
    }
  }, [tab, activeTab, navigate])

  const handleTabChange = (val: string | null) => {
    if (val && (VALID_ROLE_TABS as readonly string[]).includes(val)) {
      navigate(`/roles/${val}`)
    }
  }

  // Modals & Drawers state
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [userDrawerOpened, setUserDrawerOpened] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null)
  const [groupModalOpened, setGroupModalOpened] = useState(false)
  const [createUserModal, setCreateUserModal] = useState(false)
  const [createGroupModal, setCreateGroupModal] = useState(false)

  // Edit User Modal state
  const [editUserModalOpened, setEditUserModalOpened] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  const [editExternalMappings, setEditExternalMappings] = useState<Record<string, string>>({})

  // Forms
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newDepartment, setNewDepartment] = useState('Engineering')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupCode, setNewGroupCode] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')

  // Search states
  const [userSearch, setUserSearch] = useState('')
  const [personaSearch, setPersonaSearch] = useState('')
  const [groupSearch, setGroupSearch] = useState('')

  // Persona Creation modal
  const [createPersonaModal, setCreatePersonaModal] = useState(false)
  const [newPersonaName, setNewPersonaName] = useState('')
  const [newPersonaCode, setNewPersonaCode] = useState('')
  const [newPersonaDesc, setNewPersonaDesc] = useState('')

  // Attribute addition
  const [attrKey, setAttrKey] = useState('')
  const [attrVal, setAttrVal] = useState('')

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => rbacApi.users() })
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => rbacApi.roles() })
  const supportedPlatformsQuery = useQuery({ queryKey: ['supported-platforms'], queryFn: () => rbacApi.supportedPlatforms() })

  const userList: any[] = usersQuery.data?.data ?? []
  const groupList: any[] = rolesQuery.data?.data ?? []

  // Effective attributes query for selected user
  const effectiveAttrsQuery = useQuery({
    queryKey: ['effective-attrs', selectedUser?.user_id],
    queryFn: () => rbacApi.effectiveAttrs(selectedUser.user_id),
    enabled: !!selectedUser?.user_id,
  })

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const syncIdpMutation = useMutation({
    mutationFn: () => rbacApi.syncIdp(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      notifications.show({
        title: 'IdP Reconciled ✅',
        message: res.data?.message || 'Identities and groups synchronized from IdP',
        color: 'teal',
      })
    },
  })

  const createUserMutation = useMutation({
    mutationFn: (data: any) => rbacApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setCreateUserModal(false)
      setNewUsername(''); setNewEmail(''); setNewDisplayName('')
      notifications.show({ title: 'User Created', message: 'New identity added to directory', color: 'teal' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'Creation Failed', message: err.response?.data?.detail || 'Error creating user', color: 'red' })
    },
  })

  const createGroupMutation = useMutation({
    mutationFn: (data: any) => rbacApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreateGroupModal(false)
      setNewGroupName(''); setNewGroupCode(''); setNewGroupDesc('')
      notifications.show({ title: 'Identity Group Created', message: 'New group created successfully', color: 'teal' })
    },
  })

  const createPersonaMutation = useMutation({
    mutationFn: (data: any) => rbacApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreatePersonaModal(false)
      setNewPersonaName(''); setNewPersonaCode(''); setNewPersonaDesc('')
      notifications.show({ title: 'Persona Created', message: 'New user persona created successfully', color: 'teal' })
    },
  })

  const assignGroupMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => rbacApi.assignRole({ user_id: userId, role_id: roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      notifications.show({ title: 'Group Assigned', message: 'User added to group and inherited attributes', color: 'teal' })
    },
  })

  const revokeGroupMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => rbacApi.revokeRole(userId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      notifications.show({ title: 'Group Revoked', message: 'User removed from group', color: 'orange' })
    },
  })

  const addDirectAttrMutation = useMutation({
    mutationFn: () => rbacApi.upsertAttr(selectedUser.user_id, { attribute_key: attrKey, attribute_value: attrVal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      setAttrKey(''); setAttrVal('')
      notifications.show({ title: 'Attribute Added', message: 'Direct attribute saved to user identity', color: 'teal' })
    },
  })

  const deleteDirectAttrMutation = useMutation({
    mutationFn: (key: string) => rbacApi.deleteAttr(selectedUser.user_id, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      notifications.show({ title: 'Attribute Removed', message: 'Direct attribute deleted', color: 'gray' })
    },
  })

  const addGroupAttrMutation = useMutation({
    mutationFn: () => rbacApi.upsertRoleAttr(selectedGroup.role_id, { attribute_key: attrKey, attribute_value: attrVal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      setAttrKey(''); setAttrVal('')
      notifications.show({ title: 'Group Attribute Saved', message: 'All member users automatically inherit this attribute!', color: 'teal' })
    },
  })

  const deleteGroupAttrMutation = useMutation({
    mutationFn: (key: string) => rbacApi.deleteRoleAttr(selectedGroup.role_id, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      notifications.show({ title: 'Group Attribute Removed', message: 'Attribute removed from group members', color: 'orange' })
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: any }) => rbacApi.updateUser(userId, data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      if (selectedUser && selectedUser.user_id === editingUser?.user_id) {
        setSelectedUser(res.data)
      }
      setEditUserModalOpened(false)
      notifications.show({
        title: 'User Profile & Platform Mappings Saved ✅',
        message: 'Updated user identity and platform-specific external user IDs successfully.',
        color: 'teal',
        icon: <IconCheck />,
      })
    },
    onError: (err: any) => {
      notifications.show({
        title: 'Update Failed',
        message: err.response?.data?.detail || 'Failed to update user profile',
        color: 'red',
      })
    },
  })

  const handleOpenEditUser = (u: any) => {
    setEditingUser(u)
    setEditDisplayName(u.display_name || u.username || '')
    setEditEmail(u.email || '')
    setEditCountry(u.country || '')
    setEditJobTitle(u.job_title || 'Data Practitioner')
    setEditDepartment(u.department || 'Engineering')
    setEditIsActive(u.is_active !== false)
    setEditGroupIds((u.groups || []).map((g: any) => String(g.role_id)))
    const mappingMap: Record<string, string> = {}
    ;(u.external_mappings || []).forEach((em: any) => {
      if (em.platform_code) {
        mappingMap[em.platform_code.toUpperCase()] = em.external_user_id || ''
      }
    })
    setEditExternalMappings(mappingMap)
    setEditUserModalOpened(true)
  }

  const handleSaveEditUser = () => {
    if (!editingUser) return
    const mappingList = Object.entries(editExternalMappings).map(([platform_code, external_user_id]) => ({
      platform_code,
      external_user_id: (external_user_id || '').trim(),
    }))
    updateUserMutation.mutate({
      userId: editingUser.user_id,
      data: {
        display_name: editDisplayName,
        email: editEmail,
        country: editCountry,
        department: editDepartment,
        job_title: editJobTitle,
        is_active: editIsActive,
        group_ids: editGroupIds.map(Number),
        external_mappings: mappingList,
      },
    })
  }

  // Open user drawer
  const handleInspectUser = (u: any) => {
    setSelectedUser(u)
    setUserDrawerOpened(true)
  }

  // Open group modal
  const handleInspectGroup = (g: any) => {
    setSelectedGroup(g)
    setGroupModalOpened(true)
  }

  const filteredUsers = userList.filter((u: any) => {
    if (!userSearch.trim()) return true
    const q = userSearch.toLowerCase()
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q) ||
      (u.groups || []).some((g: any) => (g.role_name || '').toLowerCase().includes(q))
    )
  })

  const filteredPersonas = groupList.filter((g: any) => {
    if (!personaSearch.trim()) return true
    const q = personaSearch.toLowerCase()
    return (
      (g.role_name || '').toLowerCase().includes(q) ||
      (g.role_code || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    )
  })

  const filteredGroups = groupList.filter((g: any) => {
    if (!groupSearch.trim()) return true
    const q = groupSearch.toLowerCase()
    return (
      (g.role_name || '').toLowerCase().includes(q) ||
      (g.role_code || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    )
  })

  return (
    <Stack gap="lg">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Users, Personas & Identity Groups</Title>
          <Text c="dimmed" size="sm">
            Manage enterprise user identities, external platform user credentials, business personas, and IdP identity groups.
          </Text>
        </Box>
      </Group>

      {/* ── Main Identity Tabs ───────────────────────────────────────────────── */}
      <Tabs value={activeTab} onChange={handleTabChange} color="indigo">
        <Tabs.List mb="md">
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            Users ({userList.length})
          </Tabs.Tab>
          <Tabs.Tab value="personas" leftSection={<IconShieldCheck size={16} />}>
            Persona ({groupList.length})
          </Tabs.Tab>
          <Tabs.Tab value="groups" leftSection={<IconFolder size={16} />}>
            Identity Groups ({groupList.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* ── TAB 1: Users ────────────────────────────────────────────────────── */}
        <Tabs.Panel value="users">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Users</Text>
                <Text size="xs" c="dimmed">Enterprise user identities, platform credentials, and persona memberships</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search users..."
                  leftSection={<IconSearch size={14} />}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={userSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setUserSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  leftSection={<IconUserPlus size={16} />}
                  color="indigo"
                  size="sm"
                  onClick={() => setCreateUserModal(true)}
                >
                  Add User
                </Button>
              </Group>
            </Group>

            <Card radius="md" withBorder p={0} style={{ overflow: 'hidden' }}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>User Identity</Table.Th>
                    <Table.Th>Department & Title</Table.Th>
                    <Table.Th>Persona & Group Membership</Table.Th>
                    <Table.Th>External Platform Mappings</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {usersQuery.isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={5}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{userSearch ? `No users match "${userSearch}"` : 'No identities found. Click "Add User".'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredUsers.map((u: any) => {
                      const groups: any[] = u.groups || []
                      const extMaps: any[] = u.external_mappings || []
                      return (
                        <Table.Tr key={u.user_id}>
                          <Table.Td>
                            <Group gap="sm">
                              <Avatar color="indigo" size="md" radius="md">
                                {(u.display_name || u.username)[0].toUpperCase()}
                              </Avatar>
                              <Box>
                                <Group gap={6}>
                                  <Text size="sm" fw={600}>{u.display_name || u.username}</Text>
                                  {u.country && (
                                    <Badge size="xs" variant="light" color="cyan">{u.country}</Badge>
                                  )}
                                </Group>
                                <Text size="xs" c="dimmed">{u.email}</Text>
                              </Box>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={500}>{u.department || 'Engineering'}</Text>
                            <Text size="xs" c="dimmed">{u.job_title || 'Data Practitioner'}</Text>
                          </Table.Td>
                          <Table.Td>
                            {groups.length > 0 ? (
                              <Group gap={4}>
                                {groups.map((g: any) => (
                                  <Badge key={g.role_id} size="xs" color="indigo" variant="light">
                                    {g.role_name}
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Badge size="xs" color="gray" variant="outline">
                                Direct User (0 Personas)
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {extMaps.length > 0 ? (
                              <Group gap={4}>
                                {extMaps.map((em: any, idx: number) => {
                                  const conf = SUPPORTED_PLATFORMS_CONFIG.find((c) => c.code === em.platform_code)
                                  return (
                                    <Tooltip key={idx} label={`Platform: ${em.platform_code} • ID: ${em.external_user_id}`}>
                                      <Badge size="xs" color={conf?.color || 'blue'} variant="light">
                                        {em.platform_code}: {em.external_user_id}
                                      </Badge>
                                    </Tooltip>
                                  )
                                })}
                              </Group>
                            ) : (
                              <Badge size="xs" color="gray" variant="dot">No Mappings</Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Button
                                size="xs"
                                variant="light"
                                color="indigo"
                                leftSection={<IconEdit size={14} />}
                                onClick={() => handleOpenEditUser(u)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="default"
                                leftSection={<IconId size={14} />}
                                onClick={() => handleInspectUser(u)}
                              >
                                Inspect User
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )
                    })
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* ── TAB 2: Persona ──────────────────────────────────────────────────── */}
        <Tabs.Panel value="personas">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Personas</Text>
                <Text size="xs" c="dimmed">Functional personas and entitlement archetypes mapped across enterprise data engines</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search personas..."
                  leftSection={<IconSearch size={14} />}
                  value={personaSearch}
                  onChange={(e) => setPersonaSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={personaSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setPersonaSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  color="indigo"
                  size="sm"
                  onClick={() => setCreatePersonaModal(true)}
                >
                  Create Persona
                </Button>
              </Group>
            </Group>

            <Card radius="md" withBorder p={0} style={{ overflow: 'hidden' }}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Persona Name</Table.Th>
                    <Table.Th>Persona Code</Table.Th>
                    <Table.Th>Active Members</Table.Th>
                    <Table.Th>Description</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rolesQuery.isLoading ? (
                    [...Array(4)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={4}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredPersonas.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{personaSearch ? `No personas match "${personaSearch}"` : 'No personas found.'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredPersonas.map((g: any) => (
                      <Table.Tr key={g.role_id}>
                        <Table.Td>
                          <Group gap="sm">
                            <ThemeIcon color="indigo" variant="light" size="md" radius="md">
                              <IconShieldCheck size={18} />
                            </ThemeIcon>
                            <Box>
                              <Text size="sm" fw={600}>{g.role_name}</Text>
                              <Text size="xs" c="dimmed">{g.description || 'Functional user persona'}</Text>
                            </Box>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color="indigo" variant="outline">{g.role_code}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color={g.member_count > 0 ? 'teal' : 'gray'} variant="light">
                            {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">{g.description || 'Enterprise access archetype'}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* ── TAB 3: Identity Groups ───────────────────────────────────────────── */}
        <Tabs.Panel value="groups">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Identity Groups</Text>
                <Text size="xs" c="dimmed">Directory groups synchronized from Identity Providers (Okta, SCIM, Active Directory, LDAP)</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search identity groups..."
                  leftSection={<IconSearch size={14} />}
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={groupSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setGroupSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  variant="default"
                  size="sm"
                  leftSection={<IconRefresh size={16} />}
                  loading={syncIdpMutation.isPending}
                  onClick={() => syncIdpMutation.mutate()}
                >
                  Sync from IdP (Okta / SCIM)
                </Button>
                <Button
                  leftSection={<IconFolderPlus size={16} />}
                  color="indigo"
                  size="sm"
                  onClick={() => setCreateGroupModal(true)}
                >
                  Create Group
                </Button>
              </Group>
            </Group>

            <Card radius="md" withBorder p={0} style={{ overflow: 'hidden' }}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Identity Group</Table.Th>
                    <Table.Th>Group Code / DN</Table.Th>
                    <Table.Th>Active Members</Table.Th>
                    <Table.Th>Source Directory</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rolesQuery.isLoading ? (
                    [...Array(4)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={4}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredGroups.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{groupSearch ? `No groups match "${groupSearch}"` : 'No identity groups found.'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredGroups.map((g: any) => (
                      <Table.Tr key={g.role_id}>
                        <Table.Td>
                          <Group gap="sm">
                            <ThemeIcon color="violet" variant="light" size="md" radius="md">
                              <IconFolder size={18} />
                            </ThemeIcon>
                            <Box>
                              <Text size="sm" fw={600}>{g.role_name}</Text>
                              <Text size="xs" c="dimmed">{g.description || 'Directory synchronized group'}</Text>
                            </Box>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color="violet" variant="outline">{g.role_code}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color={g.member_count > 0 ? 'teal' : 'gray'} variant="light">
                            {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color="blue" variant="light">
                            Okta / SCIM Directory
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* ── USER EFFECTIVE ATTRIBUTE INSPECTOR DRAWER ──────────────────────── */}
      <Drawer
        opened={userDrawerOpened}
        onClose={() => setUserDrawerOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="md">
              <IconId size={18} />
            </ThemeIcon>
            <Title order={4}>User Identity Details</Title>
          </Group>
        }
        position="right"
        size="lg"
        padding="md"
      >
        {selectedUser && (
          <Stack gap="md">
            {/* User Profile Overview */}
            <Paper p="md" radius="md" withBorder>
              <Group justify="space-between" align="flex-start">
                <Group gap="md">
                  <Avatar color="indigo" size="lg" radius="md">
                    {(selectedUser.display_name || selectedUser.username)[0].toUpperCase()}
                  </Avatar>
                  <Box>
                    <Group gap="xs">
                      <Text fw={700} size="md">{selectedUser.display_name || selectedUser.username}</Text>
                      {selectedUser.country && (
                        <Badge size="xs" color="cyan" variant="light">{selectedUser.country}</Badge>
                      )}
                      <Badge size="xs" color={selectedUser.is_active !== false ? 'teal' : 'gray'}>
                        {selectedUser.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">{selectedUser.email}</Text>
                    <Text size="xs" c="dimmed">{selectedUser.job_title || 'Data Practitioner'} • {selectedUser.department || 'Engineering'}</Text>
                  </Box>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="indigo"
                  leftSection={<IconEdit size={14} />}
                  onClick={() => handleOpenEditUser(selectedUser)}
                >
                  Edit Profile & Mappings
                </Button>
              </Group>
            </Paper>

            {/* IAM & Audit Metadata */}
            <Card withBorder p="sm" radius="md">
              <Text fw={600} size="xs" tt="uppercase" c="dimmed" mb={8}>IAM & Audit Metadata</Text>
              <SimpleGrid cols={2} spacing="xs">
                <Box>
                  <Text size="xs" c="dimmed">IAM Sync Identifier</Text>
                  <Code color="indigo">usr-{selectedUser.user_id}</Code>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Username (Internal)</Text>
                  <Text size="xs" fw={500}>@{selectedUser.username}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Created At</Text>
                  <Text size="xs">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '2026-09-01'}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Last Updated</Text>
                  <Text size="xs">{selectedUser.updated_at ? new Date(selectedUser.updated_at).toLocaleString() : 'Recently'}</Text>
                </Box>
                <Box style={{ gridColumn: 'span 2' }}>
                  <Text size="xs" c="dimmed">LDAP / Directory DN</Text>
                  <Text size="xs" style={{ wordBreak: 'break-all' }}>
                    {selectedUser.ldap_dn || `uid=${selectedUser.username},ou=users,dc=ces,dc=internal`}
                  </Text>
                </Box>
              </SimpleGrid>
            </Card>

            {/* External Platform Mappings Card */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Box>
                  <Title order={5}>External Platform User Mappings</Title>
                  <Text size="xs" c="dimmed">
                    Platform-specific credentials used when connecting to data engines
                  </Text>
                </Box>
                <ActionIcon
                  variant="light"
                  color="indigo"
                  size="sm"
                  onClick={() => handleOpenEditUser(selectedUser)}
                >
                  <IconEdit size={14} />
                </ActionIcon>
              </Group>
              {(selectedUser.external_mappings || []).length > 0 ? (
                <Stack gap={6}>
                  {(selectedUser.external_mappings || []).map((em: any, idx: number) => {
                    const conf = SUPPORTED_PLATFORMS_CONFIG.find((c) => c.code === em.platform_code)
                    const IconComp = conf?.icon || IconServer
                    return (
                      <Paper key={idx} p="xs" withBorder radius="sm">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <ThemeIcon size="sm" color={conf?.color || 'blue'} variant="light">
                              <IconComp size={14} />
                            </ThemeIcon>
                            <Box>
                              <Text size="xs" fw={600}>{conf?.name || em.platform_code}</Text>
                              <Badge size="xs" variant="outline" color={conf?.color || 'blue'}>
                                {em.platform_code}
                              </Badge>
                            </Box>
                          </Group>
                          <Code fw={700} color={conf?.color || 'blue'}>{em.external_user_id}</Code>
                        </Group>
                      </Paper>
                    )
                  })}
                </Stack>
              ) : (
                <Alert color="gray" variant="light" p="xs">
                  <Text size="xs">
                    No external platform mappings configured. Click "Edit Profile & Mappings" to map Snowflake, Redshift, Databricks, or BigQuery user IDs.
                  </Text>
                </Alert>
              )}
            </Card>

            {/* Group Memberships & Quick Assign */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Title order={5}>Persona & Group Memberships</Title>
                <Select
                  placeholder="Assign to Persona/Group..."
                  size="xs"
                  data={groupList
                    .filter((g) => !(selectedUser.groups || []).some((ug: any) => ug.role_id === g.role_id))
                    .map((g) => ({ value: String(g.role_id), label: g.role_name }))}
                  onChange={(val) => {
                    if (val) assignGroupMutation.mutate({ userId: selectedUser.user_id, roleId: Number(val) })
                  }}
                />
              </Group>

              <Group gap={6}>
                {(selectedUser.groups || []).length > 0 ? (
                  (selectedUser.groups || []).map((g: any) => (
                    <Badge
                      key={g.role_id}
                      size="sm"
                      color="indigo"
                      variant="light"
                      rightSection={
                        <ActionIcon
                          size="xs"
                          color="indigo"
                          variant="subtle"
                          onClick={() => revokeGroupMutation.mutate({ userId: selectedUser.user_id, roleId: g.role_id })}
                        >
                          <IconTrash size={10} />
                        </ActionIcon>
                      }
                    >
                      {g.role_name}
                    </Badge>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">No group or persona memberships assigned.</Text>
                )}
              </Group>
            </Card>
          </Stack>
        )}
      </Drawer>

      {/* ── EDIT USER MODAL (BASIC INFO, IAM, AUDIT, GROUPS, EXTERNAL MAPPINGS) ─ */}
      <Modal
        opened={editUserModalOpened}
        onClose={() => setEditUserModalOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="lg" radius="md">
              <IconEdit size={20} />
            </ThemeIcon>
            <Box>
              <Title order={4}>Edit User Identity & External Mappings</Title>
              <Text size="xs" c="dimmed">
                IAM Sync: usr-{editingUser?.user_id} • @{editingUser?.username}
              </Text>
            </Box>
          </Group>
        }
        size="xl"
        radius="md"
      >
        {editingUser && (
          <Stack gap="md">
            {/* Basic Information */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">1. Basic Identity Information</Title>
              <Grid gutter="md">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Full Name / Display Name"
                    placeholder="e.g. Alice Chen"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Email Address"
                    placeholder="e.g. alice.chen@acme.corp"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Country / Region"
                    placeholder="e.g. US, SG, DE, UK, IN"
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Position / Title"
                    placeholder="e.g. Lead Data Engineer"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Department"
                    placeholder="e.g. Engineering, Analytics"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Switch
                    label="Active Identity (Permit Authentication & Entitlement Evaluations)"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.currentTarget.checked)}
                    color="teal"
                  />
                </Grid.Col>
              </Grid>
            </Card>

            {/* IAM & Audit Information (System Managed) */}
            <Card withBorder p="md" radius="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
              <Title order={5} mb="xs" c="dimmed">2. IAM & Directory Audit Information</Title>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">IAM Identifier</Text>
                  <Code fw={700} color="indigo">usr-{editingUser.user_id}</Code>
                </Paper>
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">Date Created</Text>
                  <Text size="xs" fw={500}>
                    {editingUser.created_at ? new Date(editingUser.created_at).toLocaleString() : '2026-09-01'}
                  </Text>
                </Paper>
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">Last Updated</Text>
                  <Text size="xs" fw={500}>
                    {editingUser.updated_at ? new Date(editingUser.updated_at).toLocaleString() : 'Recently'}
                  </Text>
                </Paper>
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">Directory Username</Text>
                  <Text size="xs" fw={600}>@{editingUser.username}</Text>
                </Paper>
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">Last Active / Synced</Text>
                  <Text size="xs" fw={500} c="teal">
                    {editingUser.last_synced_at ? new Date(editingUser.last_synced_at).toLocaleString() : 'Active (Online)'}
                  </Text>
                </Paper>
                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" c="dimmed">LDAP / IdP DN</Text>
                  <Text size="xs" truncate>
                    {editingUser.ldap_dn || `uid=${editingUser.username},ou=users,dc=acme,dc=corp`}
                  </Text>
                </Paper>
              </SimpleGrid>
            </Card>

            {/* Group Memberships */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">3. Group Memberships (0..N)</Title>
              <Text size="xs" c="dimmed" mb="sm">
                Select groups this user belongs to. The user automatically inherits ABAC attributes and platform entitlements from all selected groups.
              </Text>
              <MultiSelect
                placeholder="Assign to one or more identity groups..."
                data={groupList.map((g) => ({ value: String(g.role_id), label: g.role_name }))}
                value={editGroupIds}
                onChange={setEditGroupIds}
                searchable
                clearable
              />
            </Card>

            {/* External User Mapping */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Box>
                  <Title order={5}>4. External User Mapping</Title>
                  <Text size="xs" c="dimmed">
                    Configure platform-specific external user IDs for all supported data platforms.
                  </Text>
                </Box>
                <Badge color="indigo" variant="light">Engine-Specific Credentials</Badge>
              </Group>

              <Alert
                icon={<IconInfoCircle size={16} />}
                color="blue"
                variant="light"
                mb="md"
                p="xs"
              >
                <Text size="xs">
                  <strong>Important:</strong> When establishing connections or testing credentials on target platforms, Central Entitlement Service passes the respective platform's <strong>External User ID</strong> rather than the internal CES username.
                </Text>
              </Alert>

              <Stack gap="sm">
                {SUPPORTED_PLATFORMS_CONFIG.map((platform) => {
                  const IconComponent = platform.icon
                  const currentVal = editExternalMappings[platform.code] || ''
                  return (
                    <Paper key={platform.code} p="xs" withBorder radius="sm">
                      <Grid align="center">
                        <Grid.Col span={{ base: 12, sm: 5 }}>
                          <Group gap="xs">
                            <ThemeIcon size="md" color={platform.color} variant="light" radius="sm">
                              <IconComponent size={18} />
                            </ThemeIcon>
                            <Box>
                              <Text size="xs" fw={600}>{platform.name}</Text>
                              <Badge size="xs" variant="outline" color={platform.color}>
                                {platform.code}
                              </Badge>
                            </Box>
                          </Group>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 7 }}>
                          <TextInput
                            size="xs"
                            placeholder={platform.placeholder}
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value
                              setEditExternalMappings((prev) => ({
                                ...prev,
                                [platform.code]: val,
                              }))
                            }}
                            rightSection={
                              currentVal.trim() ? (
                                <ThemeIcon size="xs" color="teal" variant="light">
                                  <IconCheck size={12} />
                                </ThemeIcon>
                              ) : null
                            }
                          />
                        </Grid.Col>
                      </Grid>
                    </Paper>
                  )
                })}
              </Stack>
            </Card>

            {/* Actions */}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditUserModalOpened(false)}>
                Cancel
              </Button>
              <Button
                color="indigo"
                loading={updateUserMutation.isPending}
                onClick={handleSaveEditUser}
                leftSection={<IconCheck size={16} />}
              >
                Save Identity & External Mappings
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>



      {/* ── CREATE USER MODAL ──────────────────────────────────────────────── */}
      <Modal
        opened={createUserModal}
        onClose={() => setCreateUserModal(false)}
        title={<Title order={4}>Add New User Identity</Title>}
        radius="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Username"
            placeholder="e.g. alex.morgan"
            required
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
          <TextInput
            label="Email Address"
            placeholder="e.g. alex.morgan@acme.com"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <TextInput
            label="Display Name"
            placeholder="e.g. Alex Morgan"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
          />
          <TextInput
            label="Department"
            placeholder="e.g. Finance Analytics"
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
          />
          <Button
            mt="md"
            color="indigo"
            disabled={!newUsername.trim() || !newEmail.trim()}
            loading={createUserMutation.isPending}
            onClick={() => createUserMutation.mutate({
              username: newUsername,
              email: newEmail,
              display_name: newDisplayName || newUsername,
              department: newDepartment,
            })}
          >
            Create User Identity
          </Button>
        </Stack>
      </Modal>

      {/* ── CREATE GROUP MODAL ─────────────────────────────────────────────── */}
      <Modal
        opened={createGroupModal}
        onClose={() => setCreateGroupModal(false)}
        title={<Title order={4}>Create Identity Group</Title>}
        radius="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Group Name"
            placeholder="e.g. Risk Analytics"
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <TextInput
            label="Group Code"
            placeholder="e.g. ROLE_RISK_ANALYTICS"
            required
            value={newGroupCode}
            onChange={(e) => setNewGroupCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          />
          <TextInput
            label="Description"
            placeholder="Identity group for risk and fraud models"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
          />
          <Button
            mt="md"
            color="indigo"
            disabled={!newGroupName.trim() || !newGroupCode.trim()}
            loading={createGroupMutation.isPending}
            onClick={() => createGroupMutation.mutate({
              role_name: newGroupName,
              role_code: newGroupCode,
              description: newGroupDesc,
            })}
          >
            Create Identity Group
          </Button>
        </Stack>
      </Modal>

      {/* ── CREATE PERSONA MODAL ───────────────────────────────────────────── */}
      <Modal
        opened={createPersonaModal}
        onClose={() => setCreatePersonaModal(false)}
        title={<Title order={4}>Create User Persona</Title>}
        radius="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Persona Name"
            placeholder="e.g. Senior Quantitative Analyst"
            required
            value={newPersonaName}
            onChange={(e) => setNewPersonaName(e.target.value)}
          />
          <TextInput
            label="Persona Code"
            placeholder="e.g. PERSONA_SR_QUANT"
            required
            value={newPersonaCode}
            onChange={(e) => setNewPersonaCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          />
          <TextInput
            label="Description"
            placeholder="Entitlement archetype for quantitative modeling teams"
            value={newPersonaDesc}
            onChange={(e) => setNewPersonaDesc(e.target.value)}
          />
          <Button
            mt="md"
            color="indigo"
            disabled={!newPersonaName.trim() || !newPersonaCode.trim()}
            loading={createPersonaMutation.isPending}
            onClick={() => createPersonaMutation.mutate({
              role_name: newPersonaName,
              role_code: newPersonaCode,
              description: newPersonaDesc,
            })}
          >
            Create Persona
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
