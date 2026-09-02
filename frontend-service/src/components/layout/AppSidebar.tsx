import { NavLink, Stack, Text, Group, Avatar, Box, Divider } from '@mantine/core'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  IconShieldCheck, IconDatabase, IconUsers, IconClipboardList,
  IconRocket, IconLayoutDashboard, IconShield,
} from '@tabler/icons-react'
import { useAuthStore } from '../../store/authStore'

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',   icon: IconLayoutDashboard },
  { label: 'Policies',     href: '/policies',    icon: IconShieldCheck },
  { label: 'Data Catalog', href: '/catalog',     icon: IconDatabase },
  { label: 'Roles & Users',href: '/roles',       icon: IconUsers },
  { label: 'Deployments',  href: '/deployments', icon: IconRocket },
  { label: 'Audit Log',    href: '/audit',       icon: IconClipboardList },
]

export default function AppSidebar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuthStore()

  return (
    <Stack h="100%" justify="space-between" p="xs" gap={0} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
      {/* Brand Header */}
      <Box>
        <Group gap="xs" px="xs" py="sm" mb="xs">
          <Box
            style={{
              width: 26,
              height: 26,
              borderRadius: 4,
              background: 'var(--mantine-color-indigo-filled)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconShield size={16} color="white" />
          </Box>
          <Box>
            <Text fw={600} size="sm" lh={1.2}>CES Hub</Text>
            <Text size="10px" c="dimmed" lh={1.2}>Platform v1.0</Text>
          </Box>
        </Group>

        <Divider mb="xs" />

        {/* Minimal Navigation links */}
        <Stack gap={3}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.href)
            return (
              <NavLink
                key={item.href}
                label={item.label}
                leftSection={<item.icon size={16} stroke={1.5} />}
                active={active}
                onClick={() => navigate(item.href)}
                style={{
                  borderRadius: 4,
                  fontSize: '0.8125rem',
                  fontWeight: active ? 500 : 400,
                  padding: '7px 10px',
                }}
                color="indigo"
                variant="light"
              />
            )
          })}
        </Stack>
      </Box>

      {/* User profile footer */}
      <Box>
        <Divider mb="xs" />
        <Group justify="space-between" px="xs" py="xs">
          <Group gap="xs">
            <Avatar color="indigo" radius="sm" size="sm">
              {user?.username?.[0]?.toUpperCase() ?? 'A'}
            </Avatar>
            <Box>
              <Text size="xs" fw={500} lh={1.2}>{user?.username ?? 'admin'}</Text>
              <Text size="10px" c="dimmed" lh={1.2}>
                {user?.roles?.[0] ?? 'Administrator'}
              </Text>
            </Box>
          </Group>
        </Group>
      </Box>
    </Stack>
  )
}
