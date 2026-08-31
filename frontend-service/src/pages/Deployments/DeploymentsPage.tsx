import { Stack, Title, Text, Card, Badge, Group, Box, Skeleton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { policiesApi, deploymentApi } from '../../api/client'

export default function DeploymentsPage() {
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.list({ size: 50 }) })
  const enforced = (policies.data?.data?.items ?? []).filter((p: any) => ['ENFORCED','DEPLOYING'].includes(p.status))

  return (
    <Stack gap="lg">
      <Box>
        <Title order={2}>Deployments</Title>
        <Text c="dimmed" size="sm">Real-time deployment status across all platforms</Text>
      </Box>
      <Stack gap="sm">
        {policies.isLoading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} height={70} radius="md" />)
          : enforced.map((p: any) => (
              <Card key={p.policy_id} className="glass-card" p="md">
                <Group justify="space-between">
                  <Box>
                    <Group gap="xs">
                      <Text fw={600} size="sm">{p.policy_name}</Text>
                      <Badge
                        color={p.status === 'ENFORCED' ? 'violet' : 'yellow'}
                        variant="light"
                        size="sm"
                        className={p.status === 'DEPLOYING' ? 'pulse-deploying' : ''}
                      >
                        {p.status}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" ff="monospace">{p.policy_code}</Text>
                  </Box>
                  <Text size="xs" c="dimmed">{new Date(p.updated_at).toLocaleString()}</Text>
                </Group>
              </Card>
            ))}
        {!policies.isLoading && enforced.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">No active deployments. Submit a policy to begin deployment.</Text>
        )}
      </Stack>
    </Stack>
  )
}
