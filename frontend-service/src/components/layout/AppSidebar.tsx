import { NavLink, Stack, Text, Group, Box, Divider, Badge, ActionIcon, Tooltip, ThemeIcon } from '@mantine/core'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  IconShieldCheck, IconDatabase, IconUsers, IconClipboardList,
  IconShield, IconSend, IconPlugConnected,
  IconRefresh,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { requestsApi } from '../../api/client'

export default function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  // Manual query for pending access requests count (no polling)
  const pendingQuery = useQuery({
    queryKey: ['requests-pending-count'],
    queryFn: () => requestsApi.list('PENDING'),
  })
  const pendingCount = (pendingQuery.data?.data ?? []).length

  const navSections = [
    {
      title: 'DATA PLATFORMS & ASSETS',
      items: [
        { label: 'Data Platforms', href: '/platforms', icon: IconPlugConnected },
        { label: 'Data Catalogue', href: '/catalog', icon: IconDatabase },
      ],
    },
    {
      title: 'POLICY & ACCESS GOVERNANCE',
      items: [
        { label: 'Data Policies', href: '/policies', icon: IconShieldCheck },
        {
          label: 'Access Requests',
          href: '/requests',
          icon: IconSend,
          badge: pendingCount > 0 ? `${pendingCount} Pending` : undefined,
          badgeColor: 'yellow',
        },
      ],
    },
    {
      title: 'PEOPLE & OPERATIONS',
      items: [
        { label: 'Users, Groups & Personas', href: '/roles', icon: IconUsers },
        { label: 'Deployments and Task logs', href: '/deployments', icon: IconClipboardList },
      ],
    },
  ]

  return (
    <Stack h="100%" justify="space-between" p="xs" gap={0}>
      {/* Brand Header */}
      <Box>
        <Group gap="xs" px="xs" py="sm" mb="xs">
          <ThemeIcon size={30} radius="md" color="indigo" variant="filled">
            <IconShield size={18} />
          </ThemeIcon>
          <Box>
            <Group gap={4}>
              <Text fw={700} size="sm" lh={1.2}>CES</Text>
              <Badge size="xs" color="teal" variant="light">Enterprise</Badge>
            </Group>
            <Text size="10px" c="dimmed" lh={1.2}>Central Entitlement Service</Text>
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
                    />
                  )
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
