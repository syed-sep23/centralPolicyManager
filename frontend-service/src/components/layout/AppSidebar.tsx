import { NavLink, Stack, Text, Group, Avatar, Box, Divider, Badge, ActionIcon, Tooltip } from '@mantine/core'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  IconShieldCheck, IconDatabase, IconUsers, IconClipboardList,
  IconRocket, IconLayoutDashboard, IconShield, IconTarget, IconSend, IconPlugConnected, IconTag,
  IconRefresh,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { requestsApi } from '../../api/client'

export default function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()

  // Manual query for pending access requests count (no polling)
  const pendingQuery = useQuery({
    queryKey: ['requests-pending-count'],
    queryFn: () => requestsApi.list('PENDING'),
  })
  const pendingCount = (pendingQuery.data?.data ?? []).length

  const navSections = [
    {
      title: 'GOVERNANCE & DSPM',
      items: [
        { label: 'DSPM Security Posture', href: '/dashboard', icon: IconLayoutDashboard },
        { label: 'Data Policies', href: '/policies', icon: IconShieldCheck },
        {
          label: 'Access Requests',
          href: '/requests',
          icon: IconSend,
          badge: pendingCount > 0 ? `${pendingCount} Pending` : undefined,
          badgeColor: 'yellow',
        },
        { label: 'Purpose Rules (PBAC)', href: '/purposes', icon: IconTarget },
      ],
    },
    {
      title: 'DATA ASSETS & TAGS',
      items: [
        { label: 'Data Catalog', href: '/catalog', icon: IconDatabase },
        { label: 'Tags & Classifications', href: '/tags', icon: IconTag },
        { label: 'Data Platforms', href: '/platforms', icon: IconPlugConnected },
      ],
    },
    {
      title: 'PEOPLE & OPERATIONS',
      items: [
        { label: 'Users & Groups', href: '/roles', icon: IconUsers },
        { label: 'Async Deployments', href: '/deployments', icon: IconRocket },
      ],
    },
  ]

  return (
    <Stack h="100%" justify="space-between" p="xs" gap={0} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
      {/* Brand Header */}
      <Box>
        <Group gap="xs" px="xs" py="sm" mb="xs">
          <Box
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
            }}
          >
            <IconShield size={18} color="white" />
          </Box>
          <Box>
            <Group gap={4}>
              <Text fw={700} size="sm" lh={1.2}>CES DSPM</Text>
              <Badge size="xs" color="teal" variant="light">Enterprise</Badge>
            </Group>
            <Text size="10px" c="dimmed" lh={1.2}>Data Security & Access Engine</Text>
          </Box>
        </Group>

        <Divider mb="xs" />

        {/* Nav Sections */}
        <Stack gap="md">
          {navSections.map((sec, idx) => (
            <Box key={idx}>
              <Text size="9px" fw={700} c="dimmed" px="xs" mb={4} style={{ letterSpacing: '0.8px' }}>
                {sec.title}
              </Text>
              <Stack gap={2}>
                {sec.items.map((item) => {
                  const active = location.pathname.startsWith(item.href)
                  return (
                    <NavLink
                      key={item.href}
                      label={
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="xs" fw={active ? 600 : 400}>{item.label}</Text>
                          <Group gap={4} wrap="nowrap">
                            {item.badge && (
                              <Badge size="xs" color={item.badgeColor || 'yellow'} variant="filled">
                                {item.badge}
                              </Badge>
                            )}
                            {item.href === '/requests' && (
                              <Tooltip label="Refresh pending requests count" withArrow>
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="gray"
                                  loading={pendingQuery.isFetching}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    pendingQuery.refetch()
                                  }}
                                >
                                  <IconRefresh size={12} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Group>
                      }
                      leftSection={<item.icon size={16} stroke={1.5} />}
                      active={active}
                      onClick={() => navigate(item.href)}
                      style={{
                        borderRadius: 6,
                        fontSize: '0.8125rem',
                        padding: '6px 10px',
                      }}
                      color="indigo"
                      variant="light"
                    />
                  )
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>

      {/* User profile footer */}
      <Box>
        <Divider mb="xs" />
        <Group justify="space-between" px="xs" py="xs">
          <Group gap="xs">
            <Avatar color="indigo" radius="md" size="sm">
              {user?.username?.[0]?.toUpperCase() ?? 'A'}
            </Avatar>
            <Box>
              <Text size="xs" fw={600} lh={1.2}>{user?.username ?? 'admin'}</Text>
              <Text size="10px" c="dimmed" lh={1.2}>
                {user?.roles?.[0] ?? 'Governance Admin'}
              </Text>
            </Box>
          </Group>
        </Group>
      </Box>
    </Stack>
  )
}
