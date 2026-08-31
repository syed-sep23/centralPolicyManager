import { Stack, Title, Text, Card, Table, Badge, Group, Button, Avatar, Box, Skeleton, Tabs } from '@mantine/core'
import { IconUserPlus } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { rbacApi } from '../../api/client'

export default function RoleManagerPage() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => rbacApi.users() })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rbacApi.roles() })

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Box>
          <Title order={2}>Roles & Users</Title>
          <Text c="dimmed" size="sm">Manage user-role assignments and ABAC attributes</Text>
        </Box>
      </Group>

      <Tabs defaultValue="users" color="violet">
        <Tabs.List>
          <Tabs.Tab value="users">Users ({users.data?.data?.length ?? 0})</Tabs.Tab>
          <Tabs.Tab value="roles">Roles ({roles.data?.data?.length ?? 0})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          <Card className="glass-card" p={0} style={{ overflow: 'hidden' }}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Job Title</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.isLoading
                  ? [...Array(5)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={4}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  : (users.data?.data ?? []).map((u: any) => (
                      <Table.Tr key={u.user_id}>
                        <Table.Td>
                          <Group gap="sm">
                            <Avatar color="violet" size="sm" radius="xl">{u.username[0].toUpperCase()}</Avatar>
                            <Box>
                              <Text size="sm" fw={500}>{u.display_name ?? u.username}</Text>
                              <Text size="xs" c="dimmed">{u.email}</Text>
                            </Box>
                          </Group>
                        </Table.Td>
                        <Table.Td><Text size="sm">{u.department ?? '—'}</Text></Table.Td>
                        <Table.Td><Text size="sm">{u.job_title ?? '—'}</Text></Table.Td>
                        <Table.Td>
                          <Badge color={u.is_active ? 'green' : 'red'} size="sm" variant="light">
                            {u.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="roles" pt="md">
          <Card className="glass-card" p={0} style={{ overflow: 'hidden' }}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Table.Tr>
                  <Table.Th>Role Name</Table.Th>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>Parent Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {roles.isLoading
                  ? [...Array(5)].map((_, i) => (
                      <Table.Tr key={i}><Table.Td colSpan={4}><Skeleton height={36} /></Table.Td></Table.Tr>
                    ))
                  : (roles.data?.data ?? []).map((r: any) => {
                      const parent = (roles.data?.data ?? []).find((x: any) => x.role_id === r.parent_role_id)
                      return (
                        <Table.Tr key={r.role_id}>
                          <Table.Td><Text size="sm" fw={500}>{r.role_name}</Text></Table.Td>
                          <Table.Td><Text size="xs" ff="monospace" c="dimmed">{r.role_code}</Text></Table.Td>
                          <Table.Td>{parent ? <Badge size="xs" variant="light">{parent.role_code}</Badge> : '—'}</Table.Td>
                          <Table.Td><Badge color="green" size="xs" variant="light">Active</Badge></Table.Td>
                        </Table.Tr>
                      )
                    })}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
