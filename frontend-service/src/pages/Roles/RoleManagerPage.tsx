import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, Title, Text, Card, Table, Badge, Group, Avatar, Box, Skeleton,
  Tabs, Button, Modal, TextInput, Select, MultiSelect, Switch, Grid, SimpleGrid, Paper, ThemeIcon,
  Drawer, Divider, Alert, Tooltip, ActionIcon, ScrollArea, Code, Textarea,
} from '@mantine/core'
import {
  IconUsers, IconFolder, IconPlus, IconRefresh, IconCheck, IconTrash,
  IconShieldCheck, IconId, IconLayersLinked, IconArrowRight,
  IconUserPlus, IconFolderPlus, IconInfoCircle, IconTag, IconEdit,
  IconCloud, IconBrandAws, IconServer, IconBrandGoogle,
  IconDeviceDesktop, IconSearch, IconX, IconHierarchy, IconNetwork,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { rbacApi, personasApi } from '../../api/client'

// Strict Ordering: 1. Users → 2. Identity Groups → 3. Personas
const VALID_ROLE_TABS = ['users', 'groups', 'personas'] as const
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

  // Strict Order: Users -> Groups -> Personas
  const activeTab: RoleTab = useMemo(() => {
    if (tab) {
      if (tab === 'groups' || tab === 'identity-groups') return 'groups'
      if (tab === 'personas' || tab === 'persona') return 'personas'
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

  // ─── Modals & Drawers State ──────────────────────────────────────────────────
  // User Drawer & Modals
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [userDrawerOpened, setUserDrawerOpened] = useState(false)
  const [createUserModal, setCreateUserModal] = useState(false)
  const [editUserModalOpened, setEditUserModalOpened] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editGroupIds, setEditGroupIds] = useState<string[]>([])
  const [editPersonaIds, setEditPersonaIds] = useState<string[]>([])
  const [editExternalMappings, setEditExternalMappings] = useState<Record<string, string>>({})

  // User Creation Form
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newDepartment, setNewDepartment] = useState('Engineering')
  const [newGroupIds, setNewGroupIds] = useState<string[]>([])
  const [newPersonaIds, setNewPersonaIds] = useState<string[]>([])

  // Group Modals & Drawers
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null)
  const [groupDrawerOpened, setGroupDrawerOpened] = useState(false)
  const [createGroupModal, setCreateGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupCode, setNewGroupCode] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')

  // Persona Modals & Drawers
  const [selectedPersona, setSelectedPersona] = useState<any | null>(null)
  const [personaDrawerOpened, setPersonaDrawerOpened] = useState(false)
  const [createPersonaModal, setCreatePersonaModal] = useState(false)
  const [newPersonaName, setNewPersonaName] = useState('')
  const [newPersonaCode, setNewPersonaCode] = useState('')
  const [newPersonaDesc, setNewPersonaDesc] = useState('')
  const [newPersonaGroupIds, setNewPersonaGroupIds] = useState<string[]>([])
  const [newPersonaUserIds, setNewPersonaUserIds] = useState<string[]>([])

  // Edit Persona Modal
  const [editPersonaModalOpened, setEditPersonaModalOpened] = useState(false)
  const [editingPersona, setEditingPersona] = useState<any | null>(null)
  const [editPersonaName, setEditPersonaName] = useState('')
  const [editPersonaCode, setEditPersonaCode] = useState('')
  const [editPersonaDesc, setEditPersonaDesc] = useState('')
  const [editPersonaGroupIds, setEditPersonaGroupIds] = useState<string[]>([])
  const [editPersonaUserIds, setEditPersonaUserIds] = useState<string[]>([])

  // Quick Add helpers in Drawers
  const [drawerAddGroupId, setDrawerAddGroupId] = useState<string | null>(null)
  const [drawerAddUserId, setDrawerAddUserId] = useState<string | null>(null)

  // Search states
  const [userSearch, setUserSearch] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [personaSearch, setPersonaSearch] = useState('')

  // Attribute addition
  const [attrKey, setAttrKey] = useState('')
  const [attrVal, setAttrVal] = useState('')

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => rbacApi.users() })
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => rbacApi.roles() })
  const personasQuery = useQuery({ queryKey: ['personas'], queryFn: () => personasApi.list() })
  const supportedPlatformsQuery = useQuery({ queryKey: ['supported-platforms'], queryFn: () => rbacApi.supportedPlatforms() })

  const userList: any[] = usersQuery.data?.data ?? []
  const groupList: any[] = rolesQuery.data?.data ?? []
  const personaList: any[] = personasQuery.data?.data ?? []

  // Detailed persona query when drawer is open
  const personaDetailQuery = useQuery({
    queryKey: ['persona-detail', selectedPersona?.persona_id],
    queryFn: () => personasApi.get(selectedPersona.persona_id),
    enabled: !!selectedPersona?.persona_id && personaDrawerOpened,
  })
  const activePersonaDetail = personaDetailQuery.data?.data || selectedPersona

  // Detailed group members query when group drawer is open
  const groupMembersQuery = useQuery({
    queryKey: ['group-members', selectedGroup?.role_id],
    queryFn: () => rbacApi.roleMembers(selectedGroup.role_id),
    enabled: !!selectedGroup?.role_id && groupDrawerOpened,
  })
  const groupAttrsQuery = useQuery({
    queryKey: ['group-attrs', selectedGroup?.role_id],
    queryFn: () => rbacApi.roleAttrs(selectedGroup.role_id),
    enabled: !!selectedGroup?.role_id && groupDrawerOpened,
  })

  // Effective attributes query for selected user
  const effectiveAttrsQuery = useQuery({
    queryKey: ['effective-attrs', selectedUser?.user_id],
    queryFn: () => rbacApi.effectiveAttrs(selectedUser.user_id),
    enabled: !!selectedUser?.user_id && userDrawerOpened,
  })

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const syncIdpMutation = useMutation({
    mutationFn: () => rbacApi.syncIdp(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
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
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      setCreateUserModal(false)
      setNewUsername(''); setNewEmail(''); setNewDisplayName('')
      setNewGroupIds([]); setNewPersonaIds([])
      notifications.show({ title: 'User Created ✅', message: 'New identity added to directory', color: 'teal' })
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
      notifications.show({ title: 'Identity Group Created ✅', message: 'New group created successfully in directory', color: 'teal' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'Creation Failed', message: err.response?.data?.detail || 'Error creating group', color: 'red' })
    },
  })

  const createPersonaMutation = useMutation({
    mutationFn: (data: any) => personasApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreatePersonaModal(false)
      setNewPersonaName(''); setNewPersonaCode(''); setNewPersonaDesc('')
      setNewPersonaGroupIds([]); setNewPersonaUserIds([])
      notifications.show({ title: 'Persona Created ✅', message: 'New user persona and members configured', color: 'teal' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'Creation Failed', message: err.response?.data?.detail || 'Error creating persona', color: 'red' })
    },
  })

  const updatePersonaMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => personasApi.update(id, data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['persona-detail', selectedPersona?.persona_id] })
      if (selectedPersona && selectedPersona.persona_id === res.data?.persona_id) {
        setSelectedPersona(res.data)
      }
      setEditPersonaModalOpened(false)
      notifications.show({ title: 'Persona Updated ✅', message: 'Updated persona attributes and memberships', color: 'teal' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'Update Failed', message: err.response?.data?.detail || 'Error updating persona', color: 'red' })
    },
  })

  const deletePersonaMutation = useMutation({
    mutationFn: (id: number) => personasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setPersonaDrawerOpened(false)
      setSelectedPersona(null)
      notifications.show({ title: 'Persona Removed', message: 'Persona removed from catalogue', color: 'orange' })
    },
  })

  const assignGroupToPersonaMutation = useMutation({
    mutationFn: ({ personaId, roleIds }: { personaId: number; roleIds: number[] }) =>
      personasApi.assignGroups(personaId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['persona-detail', selectedPersona?.persona_id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDrawerAddGroupId(null)
      notifications.show({ title: 'Group Assigned to Persona', message: 'Users in group now inherit this persona', color: 'teal' })
    },
  })

  const removeGroupFromPersonaMutation = useMutation({
    mutationFn: ({ personaId, roleId }: { personaId: number; roleId: number }) =>
      personasApi.removeGroup(personaId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['persona-detail', selectedPersona?.persona_id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      notifications.show({ title: 'Group Removed from Persona', message: 'Removed group from persona composition', color: 'orange' })
    },
  })

  const assignUserToPersonaMutation = useMutation({
    mutationFn: ({ personaId, userIds }: { personaId: number; userIds: number[] }) =>
      personasApi.assignUsers(personaId, userIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['persona-detail', selectedPersona?.persona_id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDrawerAddUserId(null)
      notifications.show({ title: 'Direct User Assigned', message: 'User added directly to persona', color: 'teal' })
    },
  })

  const removeUserFromPersonaMutation = useMutation({
    mutationFn: ({ personaId, userId }: { personaId: number; userId: number }) =>
      personasApi.removeUser(personaId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['persona-detail', selectedPersona?.persona_id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      notifications.show({ title: 'Direct User Removed', message: 'User removed from persona', color: 'orange' })
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: any }) => rbacApi.updateUser(userId, data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      if (selectedUser && selectedUser.user_id === editingUser?.user_id) {
        setSelectedUser(res.data)
      }
      setEditUserModalOpened(false)
      notifications.show({
        title: 'User Profile & Memberships Saved ✅',
        message: 'Updated user groups, direct persona assignments, and credentials successfully.',
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

  const assignGroupMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => rbacApi.assignRole({ user_id: userId, role_id: roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      notifications.show({ title: 'Group Assigned', message: 'User added to group and inherited attributes', color: 'teal' })
    },
  })

  const revokeGroupMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => rbacApi.revokeRole(userId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs', selectedUser?.user_id] })
      notifications.show({ title: 'Group Revoked', message: 'User removed from group', color: 'orange' })
    },
  })

  const addGroupAttrMutation = useMutation({
    mutationFn: () => rbacApi.upsertRoleAttr(selectedGroup.role_id, { attribute_key: attrKey, attribute_value: attrVal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['group-attrs', selectedGroup?.role_id] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      setAttrKey(''); setAttrVal('')
      notifications.show({ title: 'Group Attribute Saved', message: 'All member users inherit this attribute', color: 'teal' })
    },
  })

  const deleteGroupAttrMutation = useMutation({
    mutationFn: (key: string) => rbacApi.deleteRoleAttr(selectedGroup.role_id, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['group-attrs', selectedGroup?.role_id] })
      queryClient.invalidateQueries({ queryKey: ['effective-attrs'] })
      notifications.show({ title: 'Group Attribute Removed', message: 'Attribute removed from group members', color: 'orange' })
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
    setEditPersonaIds((u.personas || []).filter((p: any) => p.is_direct).map((p: any) => String(p.persona_id)))
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
        persona_ids: editPersonaIds.map(Number),
        external_mappings: mappingList,
      },
    })
  }

  const handleOpenEditPersona = (p: any) => {
    setEditingPersona(p)
    setEditPersonaName(p.persona_name || '')
    setEditPersonaCode(p.persona_code || '')
    setEditPersonaDesc(p.description || '')
    setEditPersonaGroupIds((p.groups || []).map((g: any) => String(g.role_id)))
    setEditPersonaUserIds((p.direct_users || []).map((u: any) => String(u.user_id)))
    setEditPersonaModalOpened(true)
  }

  const handleSaveEditPersona = () => {
    if (!editingPersona) return
    updatePersonaMutation.mutate({
      id: editingPersona.persona_id,
      data: {
        persona_name: editPersonaName,
        persona_code: editPersonaCode,
        description: editPersonaDesc,
        group_ids: editPersonaGroupIds.map(Number),
        user_ids: editPersonaUserIds.map(Number),
      },
    })
  }

  const handleInspectUser = (u: any) => {
    setSelectedUser(u)
    setUserDrawerOpened(true)
  }

  const handleInspectGroup = (g: any) => {
    setSelectedGroup(g)
    setGroupDrawerOpened(true)
  }

  const handleInspectPersona = (p: any) => {
    setSelectedPersona(p)
    setPersonaDrawerOpened(true)
  }

  // Filtered lists
  const filteredUsers = userList.filter((u: any) => {
    if (!userSearch.trim()) return true
    const q = userSearch.toLowerCase()
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q) ||
      (u.groups || []).some((g: any) => (g.role_name || '').toLowerCase().includes(q)) ||
      (u.personas || []).some((p: any) => (p.persona_name || '').toLowerCase().includes(q))
    )
  })

  const filteredGroups = groupList.filter((g: any) => {
    if (!groupSearch.trim()) return true
    const q = groupSearch.toLowerCase()
    return (
      (g.role_name || '').toLowerCase().includes(q) ||
      (g.role_code || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q) ||
      (g.personas || []).some((p: any) => (p.persona_name || '').toLowerCase().includes(q))
    )
  })

  const filteredPersonas = personaList.filter((p: any) => {
    if (!personaSearch.trim()) return true
    const q = personaSearch.toLowerCase()
    return (
      (p.persona_name || '').toLowerCase().includes(q) ||
      (p.persona_code || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.groups || []).some((g: any) => (g.role_name || '').toLowerCase().includes(q))
    )
  })

  return (
    <Stack gap="lg">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs" mb={4}>
            <Title order={2}>Users, Identity Groups & Personas</Title>
            <Badge color="indigo" variant="light" size="sm">3-Tier Governance Hierarchy</Badge>
          </Group>
          <Text c="dimmed" size="sm">
            Strict Ordering: <strong>1. Users</strong> (individual identities) → <strong>2. Identity Groups</strong> (teams & IdP groups) → <strong>3. Personas</strong> (functional business archetypes composed of users & groups).
          </Text>
        </Box>
      </Group>

      {/* ── Main Identity Tabs (Strict Order: Users -> Groups -> Personas) ────── */}
      <Tabs value={activeTab} onChange={handleTabChange} color="indigo">
        <Tabs.List mb="md">
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            1. Users ({userList.length})
          </Tabs.Tab>
          <Tabs.Tab value="groups" leftSection={<IconFolder size={16} />}>
            2. Identity Groups ({groupList.length})
          </Tabs.Tab>
          <Tabs.Tab value="personas" leftSection={<IconShieldCheck size={16} />}>
            3. Personas ({personaList.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* ── TAB 1: Users ────────────────────────────────────────────────────── */}
        <Tabs.Panel value="users">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>User Directory</Text>
                <Text size="xs" c="dimmed">Enterprise user identities, directory attributes, identity groups, and business personas</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search users by name, role, or persona..."
                  leftSection={<IconSearch size={14} />}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={280}
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
                    <Table.Th>Identity Groups (Part of)</Table.Th>
                    <Table.Th>Personas (Part of)</Table.Th>
                    <Table.Th>External Platform Mappings</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {usersQuery.isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={6}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{userSearch ? `No users match "${userSearch}"` : 'No identities found. Click "Add User".'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredUsers.map((u: any) => {
                      const groups: any[] = u.groups || []
                      const personas: any[] = u.personas || []
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
                                  <Badge key={g.role_id} size="xs" color="violet" variant="light" leftSection={<IconFolder size={10} />}>
                                    {g.role_name}
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Badge size="xs" color="gray" variant="outline">
                                0 Groups
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {personas.length > 0 ? (
                              <Group gap={4}>
                                {personas.map((p: any) => (
                                  <Tooltip
                                    key={p.persona_id}
                                    label={p.is_direct ? 'Directly assigned persona' : `Inherited via group(s): ${(p.via_groups || []).join(', ')}`}
                                  >
                                    <Badge
                                      size="xs"
                                      color={p.is_direct ? 'indigo' : 'cyan'}
                                      variant={p.is_direct ? 'filled' : 'light'}
                                      leftSection={<IconShieldCheck size={10} />}
                                    >
                                      {p.persona_name} {p.is_direct ? '(Direct)' : ''}
                                    </Badge>
                                  </Tooltip>
                                ))}
                              </Group>
                            ) : (
                              <Badge size="xs" color="gray" variant="outline">
                                0 Personas
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {extMaps.length > 0 ? (
                              <Group gap={4}>
                                {extMaps.map((em: any, idx: number) => {
                                  const conf = SUPPORTED_PLATFORMS_CONFIG.find((c) => c.code === em.platform_code)
                                  return (
                                    <Tooltip key={idx} label={`Platform: ${em.platform_code} • External User: ${em.external_user_id}`}>
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
                                Inspect
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

        {/* ── TAB 2: Identity Groups ───────────────────────────────────────────── */}
        <Tabs.Panel value="groups">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Identity Groups (IdP & Directory Groups)</Text>
                <Text size="xs" c="dimmed">Users belong to Identity Groups (0..N). Groups can also be constituents of high-level Personas.</Text>
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
                  Sync from IdP
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
                    <Table.Th>Active Member Users</Table.Th>
                    <Table.Th>Constituent in Personas</Table.Th>
                    <Table.Th>Source Directory</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rolesQuery.isLoading ? (
                    [...Array(4)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={6}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredGroups.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{groupSearch ? `No groups match "${groupSearch}"` : 'No identity groups found.'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredGroups.map((g: any) => {
                      const personas = g.personas || []
                      return (
                        <Table.Tr key={g.role_id}>
                          <Table.Td>
                            <Group gap="sm">
                              <ThemeIcon color="violet" variant="light" size="md" radius="md">
                                <IconFolder size={18} />
                              </ThemeIcon>
                              <Box>
                                <Text size="sm" fw={600}>{g.role_name}</Text>
                                <Text size="xs" c="dimmed">{g.description || 'Enterprise identity group'}</Text>
                              </Box>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color="violet" variant="outline">{g.role_code}</Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color={g.member_count > 0 ? 'teal' : 'gray'} variant="light">
                              {g.member_count} member user{g.member_count !== 1 ? 's' : ''}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {personas.length > 0 ? (
                              <Group gap={4}>
                                {personas.map((p: any) => (
                                  <Badge key={p.persona_id} size="xs" color="indigo" variant="light" leftSection={<IconShieldCheck size={10} />}>
                                    {p.persona_name}
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Text size="xs" c="dimmed">Direct group (Not in any Persona)</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color="blue" variant="light">
                              Okta / SCIM / Local
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              variant="default"
                              leftSection={<IconHierarchy size={14} />}
                              onClick={() => handleInspectGroup(g)}
                            >
                              Inspect Group
                            </Button>
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

        {/* ── TAB 3: Personas ─────────────────────────────────────────────────── */}
        <Tabs.Panel value="personas">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Personas (Composite Access Archetypes)</Text>
                <Text size="xs" c="dimmed">
                  High-level entitlement personas. Both <strong>Identity Groups</strong> and <strong>Users</strong> can be members of a Persona.
                </Text>
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
                  leftSection={<IconShieldCheck size={16} />}
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
                    <Table.Th>Persona Name & Description</Table.Th>
                    <Table.Th>Persona Code</Table.Th>
                    <Table.Th>Member Identity Groups</Table.Th>
                    <Table.Th>Direct Member Users</Table.Th>
                    <Table.Th>Total Effective Users</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {personasQuery.isLoading ? (
                    [...Array(4)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={6}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  ) : filteredPersonas.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                        <Text size="sm" c="dimmed">{personaSearch ? `No personas match "${personaSearch}"` : 'No personas found. Click "Create Persona".'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredPersonas.map((p: any) => {
                      const groups: any[] = p.groups || []
                      const directUsers: any[] = p.direct_users || []
                      const effCount = p.effective_user_count ?? (directUsers.length + groups.reduce((acc, g) => acc + (g.member_count || 0), 0))
                      return (
                        <Table.Tr key={p.persona_id}>
                          <Table.Td>
                            <Group gap="sm">
                              <ThemeIcon color="indigo" variant="light" size="md" radius="md">
                                <IconShieldCheck size={18} />
                              </ThemeIcon>
                              <Box>
                                <Text size="sm" fw={600}>{p.persona_name}</Text>
                                <Text size="xs" c="dimmed">{p.description || 'Enterprise business access archetype'}</Text>
                              </Box>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color="indigo" variant="outline">{p.persona_code}</Badge>
                          </Table.Td>
                          <Table.Td>
                            {groups.length > 0 ? (
                              <Group gap={4}>
                                {groups.map((g: any) => (
                                  <Badge key={g.role_id} size="xs" color="violet" variant="light" leftSection={<IconFolder size={10} />}>
                                    {g.role_name} ({g.member_count || 0})
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Text size="xs" c="dimmed">0 groups</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {directUsers.length > 0 ? (
                              <Group gap={4}>
                                {directUsers.map((u: any) => (
                                  <Badge key={u.user_id} size="xs" color="indigo" variant="outline">
                                    {u.display_name || u.username}
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Text size="xs" c="dimmed">0 direct users</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Badge size="sm" color={effCount > 0 ? 'teal' : 'gray'} variant="filled">
                              {effCount} effective user{effCount !== 1 ? 's' : ''}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Button
                                size="xs"
                                variant="light"
                                color="indigo"
                                leftSection={<IconEdit size={14} />}
                                onClick={() => handleOpenEditPersona(p)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="default"
                                leftSection={<IconNetwork size={14} />}
                                onClick={() => handleInspectPersona(p)}
                              >
                                Inspect
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
      </Tabs>

      {/* ── USER INSPECTOR DRAWER ───────────────────────────────────────────── */}
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
                  Edit Profile
                </Button>
              </Group>
            </Paper>

            {/* Personas Membership Card */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">Personas (Entitlement Archetypes)</Title>
              {(selectedUser.personas || []).length > 0 ? (
                <Stack gap="xs">
                  {(selectedUser.personas || []).map((p: any) => (
                    <Paper key={p.persona_id} p="xs" withBorder radius="sm">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ThemeIcon size="sm" color={p.is_direct ? 'indigo' : 'cyan'} variant="light">
                            <IconShieldCheck size={14} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" fw={600}>{p.persona_name}</Text>
                            <Text size="10px" c="dimmed">{p.persona_code}</Text>
                          </Box>
                        </Group>
                        <Badge size="xs" color={p.is_direct ? 'indigo' : 'cyan'} variant="light">
                          {p.is_direct ? 'Direct User Assignment' : `Via: ${(p.via_groups || []).join(', ')}`}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">No personas associated with this identity.</Text>
              )}
            </Card>

            {/* Identity Groups Card */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Title order={5}>Identity Groups (0..N)</Title>
                <Select
                  placeholder="Assign to Group..."
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
                      color="violet"
                      variant="light"
                      rightSection={
                        <ActionIcon
                          size="xs"
                          color="violet"
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
                  <Text size="xs" c="dimmed">No identity groups assigned.</Text>
                )}
              </Group>
            </Card>

            {/* External Platform Mappings Card */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">External Platform Credentials</Title>
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
                            <Text size="xs" fw={600}>{conf?.name || em.platform_code}</Text>
                          </Group>
                          <Code fw={700} color={conf?.color || 'blue'}>{em.external_user_id}</Code>
                        </Group>
                      </Paper>
                    )
                  })}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">No external platform mappings configured.</Text>
              )}
            </Card>
          </Stack>
        )}
      </Drawer>

      {/* ── GROUP INSPECTOR DRAWER ─────────────────────────────────────────── */}
      <Drawer
        opened={groupDrawerOpened}
        onClose={() => setGroupDrawerOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="violet" variant="light" size="md">
              <IconFolder size={18} />
            </ThemeIcon>
            <Title order={4}>Identity Group Details</Title>
          </Group>
        }
        position="right"
        size="lg"
        padding="md"
      >
        {selectedGroup && (
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Group gap="md">
                <ThemeIcon color="violet" size="xl" radius="md" variant="light">
                  <IconFolder size={28} />
                </ThemeIcon>
                <Box>
                  <Group gap="xs">
                    <Title order={4}>{selectedGroup.role_name}</Title>
                    <Badge color="violet" variant="outline">{selectedGroup.role_code}</Badge>
                  </Group>
                  <Text size="xs" c="dimmed">{selectedGroup.description || 'Identity directory group'}</Text>
                </Box>
              </Group>
            </Paper>

            {/* Personas containing this group */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">Member of Personas</Title>
              {(selectedGroup.personas || []).length > 0 ? (
                <Group gap="xs">
                  {(selectedGroup.personas || []).map((p: any) => (
                    <Badge key={p.persona_id} color="indigo" size="sm" variant="light" leftSection={<IconShieldCheck size={12} />}>
                      {p.persona_name} ({p.persona_code})
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="xs" c="dimmed">This identity group is not part of any high-level persona yet.</Text>
              )}
            </Card>

            {/* Member Users in this group */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">Member Users ({groupMembersQuery.data?.data?.length || 0})</Title>
              {groupMembersQuery.isLoading ? (
                <Skeleton height={60} />
              ) : (groupMembersQuery.data?.data || []).length > 0 ? (
                <Stack gap="xs">
                  {(groupMembersQuery.data?.data || []).map((u: any) => (
                    <Paper key={u.user_id} p="xs" withBorder radius="sm">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Avatar size="sm" color="violet">{(u.display_name || u.username)[0]}</Avatar>
                          <Box>
                            <Text size="xs" fw={600}>{u.display_name || u.username}</Text>
                            <Text size="10px" c="dimmed">{u.email}</Text>
                          </Box>
                        </Group>
                        <Badge size="xs" color="gray" variant="light">{u.department || 'Engineering'}</Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">No active member users in this group.</Text>
              )}
            </Card>

            {/* Group Attributes */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">Group ABAC Attributes (Inherited by Members)</Title>
              <Stack gap="xs">
                {(groupAttrsQuery.data?.data || []).map((ga: any) => (
                  <Paper key={ga.attribute_key} p="xs" withBorder radius="sm">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Code>{ga.attribute_key}</Code>
                        <IconArrowRight size={12} />
                        <Badge color="teal" variant="light">{ga.attribute_value}</Badge>
                      </Group>
                      <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => deleteGroupAttrMutation.mutate(ga.attribute_key)}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
                <Group gap="xs" mt="xs">
                  <TextInput
                    size="xs"
                    placeholder="Attribute Key"
                    value={attrKey}
                    onChange={(e) => setAttrKey(e.target.value)}
                  />
                  <TextInput
                    size="xs"
                    placeholder="Value"
                    value={attrVal}
                    onChange={(e) => setAttrVal(e.target.value)}
                  />
                  <Button
                    size="xs"
                    color="indigo"
                    disabled={!attrKey.trim() || !attrVal.trim()}
                    onClick={() => addGroupAttrMutation.mutate()}
                  >
                    Add
                  </Button>
                </Group>
              </Stack>
            </Card>
          </Stack>
        )}
      </Drawer>

      {/* ── PERSONA INSPECTOR DRAWER ───────────────────────────────────────── */}
      <Drawer
        opened={personaDrawerOpened}
        onClose={() => setPersonaDrawerOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="md">
              <IconShieldCheck size={18} />
            </ThemeIcon>
            <Title order={4}>Business Persona Details</Title>
          </Group>
        }
        position="right"
        size="xl"
        padding="md"
      >
        {activePersonaDetail && (
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Group justify="space-between" align="flex-start">
                <Group gap="md">
                  <ThemeIcon color="indigo" size="xl" radius="md" variant="filled">
                    <IconShieldCheck size={28} />
                  </ThemeIcon>
                  <Box>
                    <Group gap="xs">
                      <Title order={4}>{activePersonaDetail.persona_name}</Title>
                      <Badge color="indigo" variant="outline">{activePersonaDetail.persona_code}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed">{activePersonaDetail.description || 'Business access archetype'}</Text>
                  </Box>
                </Group>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    color="indigo"
                    leftSection={<IconEdit size={14} />}
                    onClick={() => handleOpenEditPersona(activePersonaDetail)}
                  >
                    Edit Persona
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => {
                      if (confirm(`Delete persona ${activePersonaDetail.persona_name}?`)) {
                        deletePersonaMutation.mutate(activePersonaDetail.persona_id)
                      }
                    }}
                  >
                    Delete
                  </Button>
                </Group>
              </Group>
            </Paper>

            {/* Section 1: Member Identity Groups */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Box>
                  <Title order={5}>1. Constituent Identity Groups ({activePersonaDetail.groups?.length || 0})</Title>
                  <Text size="xs" c="dimmed">All users in these groups automatically become effective members of this persona.</Text>
                </Box>
                <Group gap="xs">
                  <Select
                    placeholder="Add Identity Group..."
                    size="xs"
                    data={groupList
                      .filter((g) => !(activePersonaDetail.groups || []).some((pg: any) => pg.role_id === g.role_id))
                      .map((g) => ({ value: String(g.role_id), label: `${g.role_name} (${g.role_code})` }))}
                    value={drawerAddGroupId}
                    onChange={(val) => {
                      if (val) {
                        assignGroupToPersonaMutation.mutate({
                          personaId: activePersonaDetail.persona_id,
                          roleIds: [Number(val)],
                        })
                      }
                    }}
                  />
                </Group>
              </Group>
              {(activePersonaDetail.groups || []).length > 0 ? (
                <Stack gap="xs">
                  {(activePersonaDetail.groups || []).map((g: any) => (
                    <Paper key={g.role_id} p="xs" withBorder radius="sm">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ThemeIcon size="sm" color="violet" variant="light">
                            <IconFolder size={14} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" fw={600}>{g.role_name}</Text>
                            <Text size="10px" c="dimmed">{g.role_code}</Text>
                          </Box>
                          <Badge size="xs" color="teal" variant="light">{g.member_count || 0} user members</Badge>
                        </Group>
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="subtle"
                          onClick={() => removeGroupFromPersonaMutation.mutate({ personaId: activePersonaDetail.persona_id, roleId: g.role_id })}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Alert color="gray" variant="light" p="xs">
                  <Text size="xs">No identity groups currently added to this persona.</Text>
                </Alert>
              )}
            </Card>

            {/* Section 2: Directly Assigned Users */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Box>
                  <Title order={5}>2. Directly Assigned Users ({activePersonaDetail.direct_users?.length || 0})</Title>
                  <Text size="xs" c="dimmed">Users assigned directly to this persona independent of group membership.</Text>
                </Box>
                <Group gap="xs">
                  <Select
                    placeholder="Add Direct User..."
                    size="xs"
                    data={userList
                      .filter((u) => !(activePersonaDetail.direct_users || []).some((pu: any) => pu.user_id === u.user_id))
                      .map((u) => ({ value: String(u.user_id), label: `${u.display_name || u.username} (${u.email})` }))}
                    value={drawerAddUserId}
                    onChange={(val) => {
                      if (val) {
                        assignUserToPersonaMutation.mutate({
                          personaId: activePersonaDetail.persona_id,
                          userIds: [Number(val)],
                        })
                      }
                    }}
                  />
                </Group>
              </Group>
              {(activePersonaDetail.direct_users || []).length > 0 ? (
                <Stack gap="xs">
                  {(activePersonaDetail.direct_users || []).map((u: any) => (
                    <Paper key={u.user_id} p="xs" withBorder radius="sm">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Avatar size="sm" color="indigo">{(u.display_name || u.username)[0]}</Avatar>
                          <Box>
                            <Text size="xs" fw={600}>{u.display_name || u.username}</Text>
                            <Text size="10px" c="dimmed">{u.email} • {u.department || 'Engineering'}</Text>
                          </Box>
                        </Group>
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="subtle"
                          onClick={() => removeUserFromPersonaMutation.mutate({ personaId: activePersonaDetail.persona_id, userId: u.user_id })}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Alert color="gray" variant="light" p="xs">
                  <Text size="xs">No users directly assigned to this persona.</Text>
                </Alert>
              )}
            </Card>

            {/* Section 3: Calculated Effective Users Roster */}
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" mb="xs">
                <Box>
                  <Title order={5}>3. Effective Members Roster ({activePersonaDetail.effective_users?.length || activePersonaDetail.effective_user_count || 0})</Title>
                  <Text size="xs" c="dimmed">
                    Combined resolved roster of all users receiving entitlements via this persona.
                  </Text>
                </Box>
                <Badge color="teal" variant="filled" size="sm">
                  {activePersonaDetail.effective_users?.length || activePersonaDetail.effective_user_count || 0} Total Users
                </Badge>
              </Group>
              {(activePersonaDetail.effective_users || []).length > 0 ? (
                <ScrollArea h={220}>
                  <Table verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>User</Table.Th>
                        <Table.Th>Email & Department</Table.Th>
                        <Table.Th>Membership Source</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {(activePersonaDetail.effective_users || []).map((eu: any) => (
                        <Table.Tr key={eu.user_id}>
                          <Table.Td>
                            <Group gap="xs">
                              <Avatar size="xs" color="indigo">{(eu.display_name || eu.username)[0]}</Avatar>
                              <Text size="xs" fw={600}>{eu.display_name || eu.username}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs">{eu.email}</Text>
                            <Text size="10px" c="dimmed">{eu.department || 'Engineering'}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4}>
                              {eu.is_direct && (
                                <Badge size="xs" color="indigo" variant="filled">Direct Member</Badge>
                              )}
                              {(eu.via_groups || []).map((gname: string, i: number) => (
                                <Badge key={i} size="xs" color="violet" variant="light">
                                  Via {gname}
                                </Badge>
                              ))}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              ) : (
                <Text size="xs" c="dimmed">No effective members currently resolved.</Text>
              )}
            </Card>
          </Stack>
        )}
      </Drawer>

      {/* ── CREATE USER MODAL ──────────────────────────────────────────────── */}
      <Modal
        opened={createUserModal}
        onClose={() => setCreateUserModal(false)}
        title={<Title order={4}>Add New User Identity</Title>}
        radius="md"
        size="md"
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
          <MultiSelect
            label="Assign to Identity Groups"
            placeholder="Select groups..."
            data={groupList.map((g) => ({ value: String(g.role_id), label: g.role_name }))}
            value={newGroupIds}
            onChange={setNewGroupIds}
            searchable
            clearable
          />
          <MultiSelect
            label="Assign Directly to Personas"
            placeholder="Select personas..."
            data={personaList.map((p) => ({ value: String(p.persona_id), label: p.persona_name }))}
            value={newPersonaIds}
            onChange={setNewPersonaIds}
            searchable
            clearable
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
              group_ids: newGroupIds.map(Number),
              persona_ids: newPersonaIds.map(Number),
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
        title={
          <Group gap="xs">
            <ThemeIcon color="violet" variant="light" size="md">
              <IconFolder size={18} />
            </ThemeIcon>
            <Title order={4}>Create Identity Group</Title>
          </Group>
        }
        radius="md"
      >
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Identity Groups represent teams or directory security groups (e.g. from Okta, Azure AD, or LDAP).
          </Text>
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
          <Textarea
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
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="md">
              <IconShieldCheck size={18} />
            </ThemeIcon>
            <Title order={4}>Create User Persona</Title>
          </Group>
        }
        radius="md"
        size="lg"
      >
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            A Persona is a functional business access archetype. You can add <strong>Identity Groups</strong> and <strong>Direct Users</strong> as members of this persona.
          </Text>
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Persona Name"
                placeholder="e.g. Senior Quantitative Analyst"
                required
                value={newPersonaName}
                onChange={(e) => setNewPersonaName(e.target.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Persona Code"
                placeholder="e.g. PERSONA_SR_QUANT"
                required
                value={newPersonaCode}
                onChange={(e) => setNewPersonaCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              />
            </Grid.Col>
          </Grid>
          <Textarea
            label="Description"
            placeholder="Entitlement archetype for quantitative modeling teams across all cloud platforms"
            value={newPersonaDesc}
            onChange={(e) => setNewPersonaDesc(e.target.value)}
          />

          <Divider label="Constituent Members" labelPosition="center" my="xs" />

          <MultiSelect
            label="Constituent Identity Groups (Groups in Persona)"
            placeholder="Select groups whose users belong to this persona..."
            data={groupList.map((g) => ({
              value: String(g.role_id),
              label: `${g.role_name} (${g.member_count || 0} users)`,
            }))}
            value={newPersonaGroupIds}
            onChange={setNewPersonaGroupIds}
            searchable
            clearable
          />

          <MultiSelect
            label="Direct Member Users (Users in Persona)"
            placeholder="Select users directly assigned to this persona..."
            data={userList.map((u) => ({
              value: String(u.user_id),
              label: `${u.display_name || u.username} (${u.email})`,
            }))}
            value={newPersonaUserIds}
            onChange={setNewPersonaUserIds}
            searchable
            clearable
          />

          <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--mantine-color-indigo-0)' }}>
            <Group justify="space-between">
              <Text size="xs" fw={600}>Composition Summary:</Text>
              <Badge color="indigo">
                {newPersonaGroupIds.length} Groups + {newPersonaUserIds.length} Direct Users
              </Badge>
            </Group>
          </Paper>

          <Button
            mt="md"
            color="indigo"
            disabled={!newPersonaName.trim() || !newPersonaCode.trim()}
            loading={createPersonaMutation.isPending}
            onClick={() => createPersonaMutation.mutate({
              persona_name: newPersonaName,
              persona_code: newPersonaCode,
              description: newPersonaDesc,
              group_ids: newPersonaGroupIds.map(Number),
              user_ids: newPersonaUserIds.map(Number),
            })}
          >
            Create Business Persona
          </Button>
        </Stack>
      </Modal>

      {/* ── EDIT PERSONA MODAL ─────────────────────────────────────────────── */}
      <Modal
        opened={editPersonaModalOpened}
        onClose={() => setEditPersonaModalOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="md">
              <IconEdit size={18} />
            </ThemeIcon>
            <Title order={4}>Edit Persona: {editingPersona?.persona_name}</Title>
          </Group>
        }
        radius="md"
        size="lg"
      >
        <Stack gap="sm">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Persona Name"
                required
                value={editPersonaName}
                onChange={(e) => setEditPersonaName(e.target.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Persona Code"
                required
                value={editPersonaCode}
                onChange={(e) => setEditPersonaCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              />
            </Grid.Col>
          </Grid>
          <Textarea
            label="Description"
            value={editPersonaDesc}
            onChange={(e) => setEditPersonaDesc(e.target.value)}
          />
          <MultiSelect
            label="Constituent Identity Groups"
            data={groupList.map((g) => ({
              value: String(g.role_id),
              label: `${g.role_name} (${g.member_count || 0} users)`,
            }))}
            value={editPersonaGroupIds}
            onChange={setEditPersonaGroupIds}
            searchable
            clearable
          />
          <MultiSelect
            label="Direct Member Users"
            data={userList.map((u) => ({
              value: String(u.user_id),
              label: `${u.display_name || u.username} (${u.email})`,
            }))}
            value={editPersonaUserIds}
            onChange={setEditPersonaUserIds}
            searchable
            clearable
          />
          <Button
            mt="md"
            color="indigo"
            loading={updatePersonaMutation.isPending}
            onClick={handleSaveEditPersona}
          >
            Save Persona Changes
          </Button>
        </Stack>
      </Modal>

      {/* ── EDIT USER MODAL ────────────────────────────────────────────────── */}
      <Modal
        opened={editUserModalOpened}
        onClose={() => setEditUserModalOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="indigo" variant="light" size="lg" radius="md">
              <IconEdit size={20} />
            </ThemeIcon>
            <Box>
              <Title order={4}>Edit User Identity & Mappings</Title>
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
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">1. Basic Identity Information</Title>
              <Grid gutter="md">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Full Name / Display Name"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Email Address"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Country / Region"
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Position / Title"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Department"
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

            {/* Group Memberships */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">2. Identity Groups (0..N)</Title>
              <Text size="xs" c="dimmed" mb="sm">
                Select groups this user belongs to. The user automatically inherits ABAC attributes from all selected groups.
              </Text>
              <MultiSelect
                placeholder="Assign to one or more identity groups..."
                data={groupList.map((g) => ({ value: String(g.role_id), label: `${g.role_name} (${g.role_code})` }))}
                value={editGroupIds}
                onChange={setEditGroupIds}
                searchable
                clearable
              />
            </Card>

            {/* Direct Persona Memberships */}
            <Card withBorder p="md" radius="md">
              <Title order={5} mb="xs">3. Direct Persona Assignments</Title>
              <Text size="xs" c="dimmed" mb="sm">
                Assign this user directly to business entitlement personas (independent of group inheritance).
              </Text>
              <MultiSelect
                placeholder="Assign directly to personas..."
                data={personaList.map((p) => ({ value: String(p.persona_id), label: `${p.persona_name} (${p.persona_code})` }))}
                value={editPersonaIds}
                onChange={setEditPersonaIds}
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
    </Stack>
  )
}

