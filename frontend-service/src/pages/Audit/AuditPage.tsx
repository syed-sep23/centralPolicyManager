import { Stack, Title, Text, Card, Group, Badge, Box, Timeline, ThemeIcon } from '@mantine/core'
import { IconShieldCheck, IconRocket, IconAlertCircle } from '@tabler/icons-react'

export default function AuditPage() {
  return (
    <Stack gap="lg">
      <Box>
        <Title order={2}>Audit Log</Title>
        <Text c="dimmed" size="sm">Track all policy events, deployments, and access decisions</Text>
      </Box>
      <Card className="glass-card" p="lg">
        <Text c="dimmed" ta="center" py="xl">
          Audit events are stored in the <code>audit_events</code> table.<br />
          Connect to PostgreSQL to query: <br />
          <code>SELECT * FROM audit_events ORDER BY event_timestamp DESC LIMIT 100;</code>
        </Text>
      </Card>
    </Stack>
  )
}
