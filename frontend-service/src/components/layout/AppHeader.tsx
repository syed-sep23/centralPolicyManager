import { Group, Burger, Text, ActionIcon, Tooltip, Badge } from '@mantine/core'
import { IconBell, IconMoon, IconSun } from '@tabler/icons-react'
import { useMantineColorScheme } from '@mantine/core'

interface AppHeaderProps { opened: boolean; toggle: () => void }

export default function AppHeader({ opened, toggle }: AppHeaderProps) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        <Text visibleFrom="sm" size="sm" c="dimmed">
          Central Policy Management (CPM)
        </Text>
      </Group>

      <Group gap="xs">
        <Badge color="green" variant="dot" size="sm">
          System Healthy
        </Badge>
        <Tooltip label="Toggle theme">
          <ActionIcon variant="subtle" onClick={toggleColorScheme}>
            {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Notifications">
          <ActionIcon variant="subtle">
            <IconBell size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
