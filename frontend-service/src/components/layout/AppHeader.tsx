import { Group, Burger, Text, ActionIcon, Tooltip, Badge } from '@mantine/core'
import { IconMoon, IconSun } from '@tabler/icons-react'
import { useMantineColorScheme } from '@mantine/core'

interface AppHeaderProps {
  opened: boolean
  toggle: () => void
}

export default function AppHeader({ opened, toggle }: AppHeaderProps) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group gap="sm">
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        <Group gap="xs">
          <Text size="sm" fw={600} visibleFrom="xs">
            Central Entitlement Service
          </Text>
          <Text size="xs" c="dimmed" visibleFrom="md">
            / Policy Governance
          </Text>
        </Group>
      </Group>

      <Group gap="sm">
        <Badge color="teal" variant="dot" size="sm">
          Healthy
        </Badge>
        <Tooltip label={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}>
          <ActionIcon variant="subtle" size="sm" onClick={toggleColorScheme} aria-label="Toggle theme">
            {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
