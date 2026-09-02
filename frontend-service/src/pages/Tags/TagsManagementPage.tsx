import { useState } from 'react'
import {
  Stack, Title, Text, Card, Table, Badge, Group, Box, Skeleton,
  Button, Modal, TextInput, Select, SimpleGrid, Paper, ThemeIcon,
  Divider, Alert, ActionIcon, ScrollArea, Code, Tabs, Tooltip,
} from '@mantine/core'
import {
  IconTag, IconSparkles, IconRefresh, IconPlus, IconTrash,
  IconDatabase, IconFolder, IconChevronRight, IconCheck,
  IconShieldLock, IconColumns, IconServer, IconInfoCircle,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { metadataApi } from '../../api/client'

export default function TagsManagementPage() {
  const queryClient = useQueryClient()
  const [selectedTag, setSelectedTag] = useState<any | null>(null)
  const [createModalOpened, setCreateModalOpened] = useState(false)
  const [discoveryResult, setDiscoveryResult] = useState<any | null>(null)

  // New Tag Form
  const [newTagName, setNewTagName] = useState('')
  const [newTagParentId, setNewTagParentId] = useState<string | null>(null)
  const [newTagCategory, setNewTagCategory] = useState<string | null>('GOVERNANCE')
  const [newTagDesc, setNewTagDesc] = useState('')

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const tagsTreeQuery = useQuery({ queryKey: ['tags-tree'], queryFn: () => metadataApi.tagsTree() })
  const allTagsQuery = useQuery({ queryKey: ['tags-all'], queryFn: () => metadataApi.tags() })
  const tagAssetsQuery = useQuery({
    queryKey: ['tag-assets', selectedTag?.tag_id],
    queryFn: () => metadataApi.tagAssets(selectedTag.tag_id),
    enabled: !!selectedTag?.tag_id,
  })

  const tagTree: any[] = tagsTreeQuery.data?.data ?? []
  const allTagsList: any[] = allTagsQuery.data?.data ?? []

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const discoverMutation = useMutation({
    mutationFn: () => metadataApi.discoverTags(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['tags-tree'] })
      queryClient.invalidateQueries({ queryKey: ['tags-all'] })
      queryClient.invalidateQueries({ queryKey: ['tag-assets'] })
      setDiscoveryResult(res.data)
      notifications.show({
        title: 'Sensitive Data Discovery Complete ✅',
        message: `Scanned ${res.data.total_columns_scanned} columns, discovered ${res.data.total_discovered} sensitive elements!`,
        color: 'teal',
      })
    },
    onError: (err: any) => {
      notifications.show({ title: 'Discovery Failed', message: err.message, color: 'red' })
    },
  })

  const syncPlatformsMutation = useMutation({
    mutationFn: () => metadataApi.syncPlatformTags(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['tags-tree'] })
      queryClient.invalidateQueries({ queryKey: ['tags-all'] })
      notifications.show({
        title: 'External Catalog Tags Synced ✅',
        message: `Synced native tags from ${res.data.synced_platforms} connected platforms`,
        color: 'teal',
      })
    },
  })

  const createTagMutation = useMutation({
    mutationFn: (data: any) => metadataApi.createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-tree'] })
      queryClient.invalidateQueries({ queryKey: ['tags-all'] })
      setCreateModalOpened(false)
      setNewTagName(''); setNewTagDesc(''); setNewTagParentId(null)
      notifications.show({ title: 'Tag Created', message: 'Hierarchical tag registered in taxonomy', color: 'teal' })
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: (id: number) => metadataApi.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-tree'] })
      queryClient.invalidateQueries({ queryKey: ['tags-all'] })
      setSelectedTag(null)
      notifications.show({ title: 'Tag Deleted', message: 'Tag removed from taxonomy', color: 'gray' })
    },
  })

  const unassignTagMutation = useMutation({
    mutationFn: (assignmentId: number) => metadataApi.unassignTag(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-assets', selectedTag?.tag_id] })
      queryClient.invalidateQueries({ queryKey: ['tags-tree'] })
      notifications.show({ title: 'Tag Unassigned', message: 'Removed tag from asset', color: 'orange' })
    },
  })

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: any, depth = 0) => {
    const isSelected = selectedTag?.tag_id === node.tag_id
    const hasChildren = node.children && node.children.length > 0

    return (
      <Box key={node.tag_id} mb={4}>
        <Paper
          p="xs"
          radius="sm"
          withBorder
          onClick={() => setSelectedTag(node)}
          style={{
            marginLeft: depth * 20,
            cursor: 'pointer',
            borderColor: isSelected ? 'var(--mantine-color-violet-6)' : 'rgba(255,255,255,0.06)',
            background: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'rgba(255,255,255,0.015)',
            transition: 'all 0.15s ease',
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon
                size="sm"
                color={node.source_type === 'AUTOMATED_DISCOVERY' ? 'teal' : node.source_type === 'EXTERNAL_SYNC' ? 'blue' : 'violet'}
                variant="light"
              >
                <IconTag size={12} />
              </ThemeIcon>
              <Box>
                <Group gap={6}>
                  <Text size="sm" fw={600}>{node.tag_name}</Text>
                  {node.full_path !== node.tag_name && (
                    <Text size="xs" c="dimmed">({node.full_path})</Text>
                  )}
                </Group>
              </Box>
            </Group>

            <Group gap={6} wrap="nowrap">
              <Badge size="xs" variant="outline" color={node.source_type === 'AUTOMATED_DISCOVERY' ? 'teal' : 'gray'}>
                {node.source_type}
              </Badge>
              <Badge size="xs" color="violet" variant="filled">
                {node.asset_count || 0} asset{node.asset_count !== 1 ? 's' : ''}
              </Badge>
            </Group>
          </Group>
        </Paper>

        {hasChildren && (
          <Box mt={4}>
            {node.children.map((child: any) => renderTreeNode(child, depth + 1))}
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Stack gap="xl">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Badge color="violet" variant="filled" size="sm">Immuta Metadata Engine</Badge>
            <Badge color="teal" variant="light" size="sm">Automated Sensitive Data Discovery</Badge>
          </Group>
          <Title order={2} mt={4}>Tags & Classifications Management</Title>
          <Text c="dimmed" size="sm">
            Build custom hierarchical tags, ingest external platform tags, and run automated discovery scanners to classify sensitive data across enterprise datasets.
          </Text>
        </Box>
        <Group>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            loading={syncPlatformsMutation.isPending}
            onClick={() => syncPlatformsMutation.mutate()}
          >
            Sync Platform Tags
          </Button>
          <Button
            color="teal"
            leftSection={<IconSparkles size={16} />}
            loading={discoverMutation.isPending}
            onClick={() => discoverMutation.mutate()}
          >
            Run Sensitive Data Discovery
          </Button>
          <Button
            color="violet"
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateModalOpened(true)}
          >
            Create Custom Tag
          </Button>
        </Group>
      </Group>

      {/* ── Discovery Result Banner ──────────────────────────────────────────── */}
      {discoveryResult && (
        <Alert
          color="teal"
          title="Automated Sensitive Data Discovery Report"
          icon={<IconSparkles size={18} />}
          withCloseButton
          onClose={() => setDiscoveryResult(null)}
        >
          <Text size="sm">
            Successfully scanned <Text span fw={700}>{discoveryResult.total_columns_scanned}</Text> catalog columns. Discovered <Text span fw={700}>{discoveryResult.total_discovered}</Text> sensitive attributes and auto-applied <Text span fw={700}>{discoveryResult.new_tags_applied}</Text> new tag bindings!
          </Text>
        </Alert>
      )}

      {/* ── Main Two-Column Layout ───────────────────────────────────────────── */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Left Column: Hierarchical Taxonomy Tree */}
        <Card withBorder radius="md" p="md">
          <Group justify="space-between" mb="sm">
            <Box>
              <Title order={4}>Hierarchical Tag Taxonomy</Title>
              <Text size="xs" c="dimmed">Select any tag to view its assigned catalog assets</Text>
            </Box>
            <Badge color="violet" variant="light">{allTagsList.length} Total Tags</Badge>
          </Group>

          <ScrollArea.Autosize mah={600}>
            {tagsTreeQuery.isLoading ? (
              <Stack gap="xs">
                {[...Array(6)].map((_, i) => <Skeleton key={i} height={36} />)}
              </Stack>
            ) : (
              tagTree.map((rootNode: any) => renderTreeNode(rootNode, 0))
            )}
          </ScrollArea.Autosize>
        </Card>

        {/* Right Column: Selected Tag Asset Inspector */}
        <Card withBorder radius="md" p="md">
          {selectedTag ? (
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="xs">
                    <ThemeIcon color="violet" size="md" radius="md">
                      <IconTag size={18} />
                    </ThemeIcon>
                    <Title order={4}>{selectedTag.tag_name}</Title>
                  </Group>
                  <Text size="xs" c="dimmed" mt={2}>
                    Full Path: <Code color="violet">{selectedTag.full_path}</Code>
                  </Text>
                  {selectedTag.description && (
                    <Text size="xs" c="dimmed" mt={4}>{selectedTag.description}</Text>
                  )}
                </Box>
                <Group gap="xs">
                  <Badge color="teal" variant="light">{selectedTag.tag_category}</Badge>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => deleteTagMutation.mutate(selectedTag.tag_id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>

              <Divider my="xs" />

              <Box>
                <Title order={5} mb="xs">
                  Tagged Columns ({tagAssetsQuery.data?.data?.tagged_columns?.length || 0})
                </Title>
                <ScrollArea.Autosize mah={400}>
                  {tagAssetsQuery.isLoading ? (
                    <Skeleton height={60} />
                  ) : (tagAssetsQuery.data?.data?.tagged_columns || []).length === 0 ? (
                    <Text size="xs" c="dimmed">No columns currently tagged with this label.</Text>
                  ) : (
                    <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Column</Table.Th>
                          <Table.Th>Table / Schema</Table.Th>
                          <Table.Th>Platform</Table.Th>
                          <Table.Th>Action</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {tagAssetsQuery.data.data.tagged_columns.map((c: any) => (
                          <Table.Tr key={c.assignment_id}>
                            <Table.Td>
                              <Text size="xs" fw={700}>{c.column_name}</Text>
                              <Badge size="xs" color="gray" variant="outline">{c.data_type}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs">{c.table_name}</Text>
                              <Text size="10px" c="dimmed">{c.database_name}.{c.schema_name}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge size="xs" color="blue" variant="light">{c.platform_name}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon
                                color="red"
                                size="xs"
                                variant="subtle"
                                onClick={() => unassignTagMutation.mutate(c.assignment_id)}
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </ScrollArea.Autosize>
              </Box>
            </Stack>
          ) : (
            <Box py="xl" ta="center">
              <ThemeIcon size="xl" color="gray" variant="light" radius="xl" mb="sm">
                <IconTag size={28} />
              </ThemeIcon>
              <Title order={4} c="dimmed">Select a Tag</Title>
              <Text size="xs" c="dimmed">
                Click any tag in the taxonomy tree to inspect its bound database tables and columns.
              </Text>
            </Box>
          )}
        </Card>
      </SimpleGrid>

      {/* ── CREATE TAG MODAL ───────────────────────────────────────────────── */}
      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title={<Title order={4}>Create Custom Hierarchical Tag</Title>}
        radius="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Tag Name"
            placeholder="e.g. CreditCard, Salary, Restricted"
            required
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
          />

          <Select
            label="Parent Tag (Hierarchical Nesting)"
            placeholder="Root Tag (No Parent)"
            data={allTagsList.map((t) => ({ value: String(t.tag_id), label: t.full_path || t.tag_name }))}
            value={newTagParentId}
            onChange={setNewTagParentId}
            clearable
          />

          <Select
            label="Tag Category"
            data={[
              { value: 'PII', label: 'Personally Identifiable Information (PII)' },
              { value: 'FINANCIAL', label: 'Financial & Banking Data' },
              { value: 'CONFIDENTIALITY', label: 'Confidentiality & Classification' },
              { value: 'COMPLIANCE', label: 'Regulatory Compliance' },
              { value: 'GOVERNANCE', label: 'General Data Governance' },
            ]}
            value={newTagCategory}
            onChange={setNewTagCategory}
          />

          <TextInput
            label="Description"
            placeholder="Define purpose and sensitivity guidelines for this tag"
            value={newTagDesc}
            onChange={(e) => setNewTagDesc(e.target.value)}
          />

          <Button
            mt="md"
            color="violet"
            disabled={!newTagName.trim()}
            loading={createTagMutation.isPending}
            onClick={() => createTagMutation.mutate({
              tag_name: newTagName.trim(),
              parent_tag_id: newTagParentId ? Number(newTagParentId) : null,
              tag_category: newTagCategory,
              description: newTagDesc,
            })}
          >
            Create Tag in Taxonomy
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
