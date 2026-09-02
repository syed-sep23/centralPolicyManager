import { useState, useEffect } from 'react'
import {
  Stack, Title, Text, TextInput, Group, Badge, Card, Box,
  Tabs, Table, Skeleton, Breadcrumbs, Anchor, Select, Paper,
  Divider, ActionIcon, ScrollArea, Center, Button, Accordion,
} from '@mantine/core'
import {
  IconSearch, IconDatabase, IconTable, IconColumns, IconTag,
  IconFolder, IconFolderOpen, IconChevronRight, IconArrowLeft,
  IconKey, IconCheck, IconX, IconShieldCheck, IconFilter,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { metadataApi } from '../../api/client'

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC:'green', INTERNAL:'blue', CONFIDENTIAL:'yellow', RESTRICTED:'orange', TOP_SECRET:'red'
}

export default function DataCatalogPage() {
  const [search,        setSearch]        = useState('')
  const [tableFilter,   setTableFilter]   = useState('')
  const [columnFilter,  setColumnFilter]  = useState('')
  const [activeTab,     setActiveTab]     = useState<string | null>('platforms')

  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null)
  const [selectedDb,       setSelectedDb]        = useState<number | null>(null)
  const [selectedSchema,   setSelectedSchema]    = useState<number | null>(null)
  const [selectedTable,    setSelectedTable]     = useState<number | null>(null)

  // Data queries
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })
  const databases = useQuery({ queryKey: ['databases', selectedPlatform], queryFn: () => metadataApi.databases(selectedPlatform!), enabled: !!selectedPlatform })
  const schemas   = useQuery({ queryKey: ['schemas', selectedDb],         queryFn: () => metadataApi.schemas(selectedDb!),         enabled: !!selectedDb })
  const tables    = useQuery({ queryKey: ['tables', selectedSchema],      queryFn: () => metadataApi.tables(selectedSchema!),      enabled: !!selectedSchema })
  const columns   = useQuery({ queryKey: ['columns', selectedTable],      queryFn: () => metadataApi.columns(selectedTable!),      enabled: !!selectedTable })
  const searchRes = useQuery({ queryKey: ['search', search], queryFn: () => metadataApi.search(search), enabled: search.length >= 2 })
  const products  = useQuery({ queryKey: ['products'], queryFn: () => metadataApi.products() })

  const getList = (res: any) => {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray(res.data)) return res.data
    return []
  }

  const platformList = getList(platforms.data)
  const dbList       = getList(databases.data)
  const schemaList   = getList(schemas.data)
  const rawTableList = getList(tables.data)
  const rawColumnList= getList(columns.data)
  const productList  = getList(products.data)

  // Auto-select defaults for initial load
  useEffect(() => {
    if (!selectedPlatform && platformList.length) {
      setSelectedPlatform(platformList[0].platform_id)
    }
  }, [platformList])

  useEffect(() => {
    if (selectedPlatform && dbList.length && !selectedDb) {
      setSelectedDb(dbList[0].database_id)
    }
  }, [selectedPlatform, dbList])

  useEffect(() => {
    if (selectedDb && schemaList.length && !selectedSchema) {
      setSelectedSchema(schemaList[0].schema_id)
    }
  }, [selectedDb, schemaList])

  useEffect(() => {
    if (selectedSchema && rawTableList.length && !selectedTable) {
      setSelectedTable(rawTableList[0].table_id)
    }
  }, [selectedSchema, rawTableList])

  // Resolve object labels
  const currentPlatformObj = platformList.find((p: any) => p.platform_id === selectedPlatform)
  const currentDbObj       = dbList.find((d: any) => d.database_id === selectedDb)
  const currentSchemaObj   = schemaList.find((s: any) => s.schema_id === selectedSchema)
  const currentTableObj    = rawTableList.find((t: any) => t.table_id === selectedTable)

  // Filtered lists
  const tableList = rawTableList.filter((t: any) =>
    !tableFilter || t.table_name.toLowerCase().includes(tableFilter.toLowerCase())
  )

  const columnList = rawColumnList.filter((c: any) =>
    !columnFilter ||
    c.column_name.toLowerCase().includes(columnFilter.toLowerCase()) ||
    (c.normalized_type && c.normalized_type.toLowerCase().includes(columnFilter.toLowerCase()))
  )

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Box>
        <Title order={2}>Data Catalog & Platform Browser</Title>
        <Text c="dimmed" size="sm">Browse enterprise platform metadata, databases, schemas, tables, and column attributes</Text>
      </Box>

      {/* Global Search Bar */}
      <TextInput
        placeholder="Global Search across platforms (e.g. CUSTOMERS, EMAIL, ORDERS)..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        id="catalog-search"
        size="md"
        radius="md"
      />

      {/* Global Search Autocomplete Dropdown */}
      {search.length >= 2 && (
        <Card className="glass-card" p="md" radius="md">
          <Group justify="space-between" mb="xs">
            <Text fw={600} size="sm">Global Search Results for "{search}"</Text>
            <ActionIcon variant="subtle" size="sm" onClick={() => setSearch('')}><IconX size={14} /></ActionIcon>
          </Group>
          {searchRes.isLoading ? <Skeleton height={60} /> : (
            <Stack gap="xs">
              {(searchRes.data?.data?.tables ?? []).map((t: any) => (
                <Group key={t.table_id} gap="sm" p="xs" style={{ borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
                  onClick={() => {
                    setSelectedPlatform(t.platform_id || selectedPlatform)
                    setSelectedTable(t.table_id)
                    setSearch('')
                  }}>
                  <IconTable size={16} color="#7c3aed" />
                  <Text size="sm" fw={500}>{t.table_name}</Text>
                  <Badge size="xs" variant="outline" color="violet">TABLE</Badge>
                  <Text size="xs" c="dimmed">{t.platform_code} · {t.database_name}.{t.schema_name}</Text>
                </Group>
              ))}
              {(searchRes.data?.data?.columns ?? []).map((c: any) => (
                <Group key={c.column_id} gap="sm" p="xs" style={{ borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
                  onClick={() => {
                    if (c.table_id) setSelectedTable(c.table_id)
                    setSearch('')
                  }}>
                  <IconColumns size={16} color="#3b82f6" />
                  <Text size="sm" fw={500} ff="monospace">{c.column_name}</Text>
                  <Badge size="xs" color="blue">{c.normalized_type}</Badge>
                  <Text size="xs" c="dimmed">Table: {c.table_name} · {c.platform_code}</Text>
                </Group>
              ))}
              {(searchRes.data?.data?.tables ?? []).length === 0 && (searchRes.data?.data?.columns ?? []).length === 0 && (
                <Text size="xs" c="dimmed" py="xs">No matching tables or columns found.</Text>
              )}
            </Stack>
          )}
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab} color="violet">
        <Tabs.List>
          <Tabs.Tab value="platforms" leftSection={<IconDatabase size={16} />}>Platform Explorer</Tabs.Tab>
          <Tabs.Tab value="products"  leftSection={<IconTag size={16} />}>Data Products ({productList.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="platforms" pt="md">
          <Group align="stretch" gap="md" wrap="nowrap">
            {/* ── Left Sidebar Explorer (Hierarchy Tree) ────────────────────── */}
            <Paper p="md" radius="lg" style={{ width: 290, minWidth: 290, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Stack gap="md">
                <Box>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>TARGET PLATFORM</Text>
                  <Select
                    data={platformList.map((p: any) => ({
                      value: String(p.platform_id),
                      label: `${p.platform_name} (${p.platform_code})`,
                    }))}
                    value={selectedPlatform ? String(selectedPlatform) : null}
                    onChange={(val) => {
                      if (val) {
                        const pid = parseInt(val)
                        setSelectedPlatform(pid)
                        setSelectedDb(null)
                        setSelectedSchema(null)
                        setSelectedTable(null)
                      }
                    }}
                    leftSection={<IconDatabase size={16} color="#7c3aed" />}
                    id="platform-select-dropdown"
                  />
                </Box>

                <Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />

                <Box>
                  <Text size="xs" fw={600} c="dimmed" mb="xs">DATABASES & SCHEMAS</Text>
                  {databases.isLoading ? (
                    <Stack gap="xs">{[...Array(3)].map((_, i) => <Skeleton key={i} height={30} />)}</Stack>
                  ) : dbList.length === 0 ? (
                    <Text size="xs" c="dimmed">No databases found for platform.</Text>
                  ) : (
                    <ScrollArea.Autosize mah={500} offsetScrollbars>
                      <Accordion
                        variant="separated"
                        radius="md"
                        value={selectedDb ? String(selectedDb) : undefined}
                        onChange={(val) => {
                          if (val) {
                            const dbId = parseInt(val)
                            setSelectedDb(dbId)
                            setSelectedSchema(null)
                            setSelectedTable(null)
                          }
                        }}
                      >
                        {dbList.map((dbObj: any) => (
                          <Accordion.Item key={dbObj.database_id} value={String(dbObj.database_id)} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Accordion.Control p="xs">
                              <Group gap="xs">
                                <IconFolder size={14} color="#7c3aed" />
                                <Text size="xs" fw={600}>{dbObj.database_name}</Text>
                              </Group>
                            </Accordion.Control>
                            <Accordion.Panel p="xs">
                              {schemas.isLoading ? <Skeleton height={20} /> : (
                                <Stack gap={2}>
                                  {schemaList.map((sObj: any) => (
                                    <Box
                                      key={sObj.schema_id}
                                      p={6}
                                      style={{
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        background: selectedSchema === sObj.schema_id ? 'rgba(124,58,237,0.2)' : 'transparent',
                                        border: selectedSchema === sObj.schema_id ? '1px solid rgba(124,58,237,0.4)' : '1px solid transparent',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedSchema(sObj.schema_id)
                                        setSelectedTable(null)
                                      }}
                                    >
                                      <Group justify="space-between">
                                        <Group gap={6}>
                                          <IconFolderOpen size={12} color="#3b82f6" />
                                          <Text size="xs" fw={selectedSchema === sObj.schema_id ? 600 : 400}>
                                            {sObj.schema_name}
                                          </Text>
                                        </Group>
                                        <IconChevronRight size={12} opacity={0.5} />
                                      </Group>
                                    </Box>
                                  ))}
                                </Stack>
                              )}
                            </Accordion.Panel>
                          </Accordion.Item>
                        ))}
                      </Accordion>
                    </ScrollArea.Autosize>
                  )}
                </Box>
              </Stack>
            </Paper>

            {/* ── Right Content Area (Tables & Columns Detail View) ──────────── */}
            <Card className="glass-card" p="lg" radius="lg" style={{ flex: 1, minWidth: 0 }}>
              <Stack gap="md">
                {/* Interactive Breadcrumb Bar */}
                <Group justify="space-between" wrap="wrap">
                  <Breadcrumbs separator={<IconChevronRight size={14} opacity={0.5} />}>
                    <Anchor size="xs" fw={600} color="violet" onClick={() => { setSelectedDb(null); setSelectedSchema(null); setSelectedTable(null) }}>
                      {currentPlatformObj?.platform_name || 'Platform'}
                    </Anchor>
                    {currentDbObj && (
                      <Anchor size="xs" fw={600} color="violet" onClick={() => { setSelectedSchema(null); setSelectedTable(null) }}>
                        {currentDbObj.database_name}
                      </Anchor>
                    )}
                    {currentSchemaObj && (
                      <Anchor size="xs" fw={600} color="violet" onClick={() => setSelectedTable(null)}>
                        {currentSchemaObj.schema_name}
                      </Anchor>
                    )}
                    {currentTableObj && (
                      <Text size="xs" fw={600} c="white">{currentTableObj.table_name}</Text>
                    )}
                  </Breadcrumbs>

                  {selectedTable && (
                    <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => setSelectedTable(null)}>
                      Back to Tables List
                    </Button>
                  )}
                </Group>

                <Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />

                {/* ── CASE 1: Table Selected -> Show Table & Columns Detail ────── */}
                {selectedTable && currentTableObj ? (
                  <Stack gap="md">
                    {/* Table Header Card */}
                    <Paper p="md" radius="md" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <Group justify="space-between" align="flex-start">
                        <Box>
                          <Group gap="xs">
                            <IconTable size={20} color="#7c3aed" />
                            <Title order={3}>{currentTableObj.table_name}</Title>
                            <Badge color="violet" variant="light" size="sm">TABLE</Badge>
                          </Group>
                          <Text size="xs" c="dimmed" mt={4} ff="monospace">
                            Full Path: {currentPlatformObj?.platform_code}.{currentDbObj?.database_name}.{currentSchemaObj?.schema_name}.{currentTableObj.table_name}
                          </Text>
                        </Box>
                        <Group gap="xs">
                          <Badge variant="outline" color="blue">
                            {currentTableObj.row_count_estimate?.toLocaleString() ?? '10,000+'} Estimated Rows
                          </Badge>
                        </Group>
                      </Group>
                    </Paper>

                    {/* Columns List Header */}
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Text fw={600} size="sm">Columns Schema Breakdown</Text>
                        <Badge color="blue" size="sm">{(columns.data?.data ?? []).length} Columns</Badge>
                      </Group>

                      <TextInput
                        placeholder="Filter columns..."
                        leftSection={<IconSearch size={14} />}
                        value={columnFilter}
                        onChange={(e) => setColumnFilter(e.target.value)}
                        size="xs"
                        w={220}
                      />
                    </Group>

                    {/* Columns Table */}
                    {columns.isLoading ? (
                      <Stack gap="xs">{[...Array(5)].map((_, i) => <Skeleton key={i} height={35} />)}</Stack>
                    ) : columnList.length === 0 ? (
                      <Text size="xs" c="dimmed" ta="center" py="xl">No columns found matching filter.</Text>
                    ) : (
                      <Box style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="md">
                          <Table.Thead style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <Table.Tr>
                              <Table.Th>Column Name</Table.Th>
                              <Table.Th>Data Type</Table.Th>
                              <Table.Th>Nullable</Table.Th>
                              <Table.Th>Key Type</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {columnList.map((c: any) => (
                              <Table.Tr key={c.column_id}>
                                <Table.Td>
                                  <Group gap="xs">
                                    <IconColumns size={14} color="#6b7280" />
                                    <Text size="sm" ff="monospace" fw={600}>{c.column_name}</Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Badge size="xs" variant="light" color="blue">{c.normalized_type || 'VARCHAR'}</Badge>
                                </Table.Td>
                                <Table.Td>
                                  {c.is_nullable ? (
                                    <Badge size="xs" color="gray" variant="dot">Nullable</Badge>
                                  ) : (
                                    <Badge size="xs" color="orange" variant="outline">NOT NULL</Badge>
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  {c.is_primary_key ? (
                                    <Group gap={4}>
                                      <IconKey size={12} color="#7c3aed" />
                                      <Badge size="xs" color="violet">PRIMARY KEY</Badge>
                                    </Group>
                                  ) : '—'}
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Box>
                    )}
                  </Stack>
                ) : selectedSchema ? (
                  /* ── CASE 2: Schema Selected -> Show Tables List Grid/Table ────── */
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Box>
                        <Text fw={600} size="sm">Tables in Schema: {currentSchemaObj?.schema_name}</Text>
                        <Text size="xs" c="dimmed">Select any table to inspect column data types, primary keys, and constraints</Text>
                      </Box>
                      <TextInput
                        placeholder="Filter tables..."
                        leftSection={<IconSearch size={14} />}
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        size="xs"
                        w={240}
                      />
                    </Group>

                    {tables.isLoading ? (
                      <Stack gap="xs">{[...Array(4)].map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
                    ) : tableList.length === 0 ? (
                      <Text size="xs" c="dimmed" ta="center" py="xl">No tables found in schema {currentSchemaObj?.schema_name}.</Text>
                    ) : (
                      <Box style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                          <Table.Thead style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <Table.Tr>
                              <Table.Th>Table Name</Table.Th>
                              <Table.Th>Estimated Rows</Table.Th>
                              <Table.Th>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {tableList.map((t: any) => (
                              <Table.Tr key={t.table_id} style={{ cursor: 'pointer' }} onClick={() => setSelectedTable(t.table_id)}>
                                <Table.Td>
                                  <Group gap="xs">
                                    <IconTable size={16} color="#7c3aed" />
                                    <Text size="sm" fw={600}>{t.table_name}</Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed">{t.row_count_estimate?.toLocaleString() ?? '10,000+'} rows</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Button size="xs" variant="light" color="violet" leftSection={<IconColumns size={12} />}>
                                    View Columns
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Box>
                    )}
                  </Stack>
                ) : (
                  /* ── CASE 3: No Schema Selected ────────────────────────────────── */
                  <Center py="xl">
                    <Stack align="center" gap="xs">
                      <IconFolderOpen size={48} color="#7c3aed" opacity={0.5} />
                      <Text fw={600}>Select a Database & Schema</Text>
                      <Text size="xs" c="dimmed">Use the left sidebar tree to select a Database and Schema to view tables and column definitions.</Text>
                    </Stack>
                  </Center>
                )}
              </Stack>
            </Card>
          </Group>
        </Tabs.Panel>

        {/* Data Products Tab */}
        <Tabs.Panel value="products" pt="md">
          <Stack gap="sm">
            {productList.map((p: any) => (
              <Card key={p.product_id} className="glass-card" p="md" radius="md">
                <Group justify="space-between">
                  <Box>
                    <Group gap="xs">
                      <Text fw={600} size="sm">{p.product_name}</Text>
                      <Badge size="xs" color={SENSITIVITY_COLORS[p.sensitivity_level] ?? 'gray'} variant="light">
                        {p.sensitivity_level}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">{p.domain_name} · Code: {p.product_code}</Text>
                  </Box>
                  <Text size="xs" c="dimmed">{p.description ?? 'Data product mapping'}</Text>
                </Group>
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
