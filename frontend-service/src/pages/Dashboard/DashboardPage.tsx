import {
  Grid, Card, Text, Title, Group, Badge, Stack, RingProgress,
  SimpleGrid, Skeleton, ThemeIcon, Box, Progress,
} from '@mantine/core'
import {
  IconShieldCheck, IconRocket, IconDatabase, IconUsers,
  IconTrendingUp, IconAlertTriangle,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { policiesApi, metadataApi, rbacApi } from '../../api/client'

interface StatCardProps {
  title: string; value: string | number; icon: React.FC<any>
  color: string; trend?: string
}
function StatCard({ title, value, icon: Icon, color, trend }: StatCardProps) {
  return (
    <Card className="glass-card fade-in-up" p="lg">
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>{title}</Text>
        <ThemeIcon color={color} variant="light" size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
      <Title order={2} fw={700}>{value}</Title>
      {trend && <Text size="xs" c="green" mt={4}>{trend}</Text>}
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
    { label: 'Enforced',   value: enforced,            color: '#7c3aed' },
    { label: 'Draft',      value: draft,               color: '#6b7280' },
    { label: 'Deploying',  value: deploying,           color: '#f59e0b' },
    { label: 'Other',      value: total - enforced - draft - deploying, color: '#374151' },
  ].filter(s => s.value > 0)

  return (
    <Stack gap="lg">
      {/* Page title */}
      <Box className="hero-gradient" p="lg" style={{ borderRadius: 12 }}>
        <Title order={2} className="gradient-text">Overview</Title>
        <Text c="dimmed" size="sm">Policy governance dashboard — real-time status across all platforms</Text>
      </Box>

      {/* Stat cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard title="Total Policies"    value={total}       icon={IconShieldCheck} color="violet" />
        <StatCard title="Enforced"          value={enforced}    icon={IconTrendingUp}  color="green"  />
        <StatCard title="Platforms"         value={platforms.data?.data?.length ?? 0} icon={IconDatabase}  color="blue" />
        <StatCard title="Pending Review"    value={deploying}   icon={IconAlertTriangle} color="yellow" />
      </SimpleGrid>

      {/* Bottom row */}
      <Grid>
        {/* Policy status chart */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card className="glass-card" p="lg" h="100%">
            <Text fw={600} mb="md">Policy Status Distribution</Text>
            {policies.isLoading ? (
              <Skeleton height={160} radius="md" />
            ) : (
              <Stack align="center">
                <RingProgress
                  size={160}
                  thickness={18}
                  roundCaps
                  sections={statusDistribution.map(s => ({
                    value: total > 0 ? (s.value / total) * 100 : 0,
                    color: s.color,
                    tooltip: `${s.label}: ${s.value}`,
                  }))}
                />
                <Stack gap={4} w="100%">
                  {statusDistribution.map(s => (
                    <Group key={s.label} justify="space-between">
                      <Group gap={6}>
                        <Box w={10} h={10} style={{ borderRadius: 2, background: s.color }} />
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

        {/* Recent policies */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card className="glass-card" p="lg" h="100%">
            <Text fw={600} mb="md">Recent Policies</Text>
            {policies.isLoading ? (
              <Stack gap="xs">{[...Array(5)].map((_, i) => <Skeleton key={i} height={36} radius="sm" />)}</Stack>
            ) : (
              <Stack gap="xs">
                {items.slice(0, 6).map((p: any) => (
                  <Group key={p.policy_id} justify="space-between" p="xs"
                    style={{ borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                    <Box>
                      <Text size="sm" fw={500}>{p.policy_name}</Text>
                      <Text size="xs" c="dimmed" ff="monospace">{p.policy_code}</Text>
                    </Box>
                    <Badge
                      color={
                        p.status === 'ENFORCED' ? 'violet' :
                        p.status === 'DRAFT' ? 'gray' :
                        p.status === 'DEPLOYING' ? 'yellow' : 'red'
                      }
                      variant="light" size="sm"
                    >
                      {p.status}
                    </Badge>
                  </Group>
                ))}
                {items.length === 0 && (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    No policies yet. Create your first policy →
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
