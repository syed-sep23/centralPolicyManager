import {
  Grid, Card, Text, Title, Group, Badge, Stack, RingProgress,
  SimpleGrid, Skeleton, ThemeIcon, Box,
} from '@mantine/core'
import {
  IconShieldCheck, IconDatabase,
  IconTrendingUp, IconAlertTriangle,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { policiesApi, metadataApi } from '../../api/client'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.FC<any>
  color: string
  trend?: string
}

function StatCard({ title, value, icon: Icon, color, trend }: StatCardProps) {
  return (
    <Card p="md" radius="sm" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts="0.04em">
          {title}
        </Text>
        <ThemeIcon color={color} variant="light" size="md" radius="sm">
          <Icon size={16} />
        </ThemeIcon>
      </Group>
      <Title order={3} fw={600} lts="-0.02em">
        {value}
      </Title>
      {trend && (
        <Text size="xs" c="teal" mt={4} fw={500}>
          {trend}
        </Text>
      )}
    </Card>
  )
}

export default function DashboardPage() {
  const policies  = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.list() })
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })

  const total     = policies.data?.data?.total ?? 0
  const items     = policies.data?.data?.items ?? []
  const enforced  = items.filter((p: any) => p.status === 'ENFORCED').length
  const draft     = items.filter((p: any) => p.status === 'DRAFT').length
  const deploying = items.filter((p: any) => p.status === 'DEPLOYING').length

  const statusDistribution = [
    { label: 'Enforced',   value: enforced,            color: 'indigo' },
    { label: 'Draft',      value: draft,               color: 'gray' },
    { label: 'Deploying',  value: deploying,           color: 'yellow' },
    { label: 'Other',      value: total - enforced - draft - deploying, color: 'dark' },
  ].filter(s => s.value > 0)

  return (
    <Stack gap="md">
      {/* Clean Minimal Page Header */}
      <Box className="page-header" pb="xs">
        <Title order={3} fw={600}>
          Overview
        </Title>
        <Text c="dimmed" size="xs">
          Real-time data entitlement policies and governance status across all connected platforms
        </Text>
      </Box>

      {/* Stat Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <StatCard title="Total Policies"    value={total}                                 icon={IconShieldCheck} color="indigo" />
        <StatCard title="Enforced"          value={enforced}                              icon={IconTrendingUp}  color="teal"   />
        <StatCard title="Platforms"         value={platforms.data?.data?.length ?? 0}     icon={IconDatabase}    color="blue"   />
        <StatCard title="Pending Review"    value={deploying}                             icon={IconAlertTriangle} color="yellow" />
      </SimpleGrid>

      {/* Status Chart & Recent Policies */}
      <Grid gutter="sm">
        {/* Policy status chart */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card p="md" radius="sm" withBorder h="100%">
            <Text fw={600} size="sm" mb="sm">
              Policy Status Distribution
            </Text>
            {policies.isLoading ? (
              <Skeleton height={160} radius="sm" />
            ) : (
              <Stack align="center" gap="md">
                <RingProgress
                  size={140}
                  thickness={14}
                  roundCaps
                  sections={statusDistribution.map(s => ({
                    value: total > 0 ? (s.value / total) * 100 : 0,
                    color: s.color,
                    tooltip: `${s.label}: ${s.value}`,
                  }))}
                />
                <Stack gap={6} w="100%">
                  {statusDistribution.map(s => (
                    <Group key={s.label} justify="space-between" px="xs">
                      <Group gap={6}>
                        <Box w={8} h={8} style={{ borderRadius: 2, background: `var(--mantine-color-${s.color}-filled)` }} />
                        <Text size="xs">{s.label}</Text>
                      </Group>
                      <Text size="xs" fw={600}>{s.value}</Text>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        {/* Recent policies list */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card p="md" radius="sm" withBorder h="100%">
            <Text fw={600} size="sm" mb="sm">
              Recent Policies
            </Text>
            {policies.isLoading ? (
              <Stack gap="xs">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} height={32} radius="sm" />
                ))}
              </Stack>
            ) : (
              <Stack gap={6}>
                {items.slice(0, 6).map((p: any) => (
                  <Group
                    key={p.policy_id}
                    justify="space-between"
                    p="xs"
                    style={{
                      borderRadius: 4,
                      border: '1px solid var(--mantine-color-default-border)',
                      background: 'var(--mantine-color-default-hover)',
                    }}
                  >
                    <Box>
                      <Text size="xs" fw={500}>{p.policy_name}</Text>
                      <Text size="10px" c="dimmed" ff="monospace">{p.policy_code}</Text>
                    </Box>
                    <Badge
                      color={
                        p.status === 'ENFORCED' ? 'indigo' :
                        p.status === 'DRAFT' ? 'gray' :
                        p.status === 'DEPLOYING' ? 'yellow' : 'red'
                      }
                      variant="light"
                      size="xs"
                    >
                      {p.status}
                    </Badge>
                  </Group>
                ))}
                {items.length === 0 && (
                  <Text c="dimmed" size="xs" ta="center" py="xl">
                    No policies yet. Create your first policy in Policy Studio.
                  </Text>
                )}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
