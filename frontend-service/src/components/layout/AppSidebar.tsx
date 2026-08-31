import { NavLink, Stack, Text, Group, Avatar, Box, Divider } from '@mantine/core'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  IconShieldCheck, IconDatabase, IconUsers, IconClipboardList,
  IconRocket, IconLayoutDashboard, IconLogout, IconBracketsContain,
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
  const { user, logout } = useAuthStore()

  return (
    <Stack h="100%" justify="space-between" p="sm" gap={0}>
      {/* Logo */}
      <Box>
        <Group gap="xs" px="xs" py="md" mb="xs">
          <Box
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconBracketsContain size={18} color="white" />
          </Box>
          <Box>
            <Text fw={700} size="sm" lh={1}>CES Hub</Text>
            <Text size="xs" c="dimmed" lh={1}>Entitlement Service</Text>
          </Box>
        </Group>

        <Divider mb="sm" />

        {/* Nav links */}
        <Stack gap={2}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.href)
            return (
              <NavLink
                key={item.href}
                label={item.label}
                leftSection={<item.icon size={18} />}
                active={active}
                onClick={() => navigate(item.href)}
                style={{
                  borderRadius: 8,
                  fontWeight: active ? 600 : 400,
                }}
                color="violet"
              />
            )
          })}
        </Stack>
      </Box>

      {/* User footer */}
      <Box>
        <Divider mb="sm" />
        <Group justify="space-between" px="xs" pb="xs">
          <Group gap="sm">
            <Avatar color="violet" radius="xl" size="sm">
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </Avatar>
            <Box>
              <Text size="xs" fw={600} lh={1}>{user?.username ?? 'Guest'}</Text>
              <Text size="xs" c="dimmed" lh={1.5}>
                {user?.roles?.[0] ?? 'Viewer'}
              </Text>
            </Box>
          </Group>
          <IconLogout
            size={16}
            style={{ cursor: 'pointer', opacity: 0.6 }}
            onClick={logout}
          />
        </Group>
      </Box>
    </Stack>
  )
}
