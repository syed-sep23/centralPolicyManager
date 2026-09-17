import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack, Title, Text, TextInput, Group, Badge, Card, Box,
  Tabs, Table, Skeleton, Breadcrumbs, Anchor, Select, Paper,
  Divider, ActionIcon, ScrollArea, Center, Button, Accordion, ThemeIcon,
  Modal, MultiSelect, Tooltip, Menu,
} from '@mantine/core'
import {
  IconSearch, IconDatabase, IconTable, IconColumns, IconTag,
  IconFolder, IconFolderOpen, IconChevronRight, IconArrowLeft,
  IconKey, IconCheck, IconX, IconRefresh, IconPlus, IconEdit,
  IconTrash, IconPlugConnected, IconDots, IconBoxMultiple,
  IconSitemap, IconLink, IconLinkOff, IconPackage,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { metadataApi } from '../../api/client'

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC: 'green', INTERNAL: 'blue', CONFIDENTIAL: 'yellow', RESTRICTED: 'orange', TOP_SECRET: 'red'
}

const SENSITIVITY_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'TOP_SECRET', label: 'Top Secret' },
]

const VALID_CATALOG_TABS = ['platforms', 'products', 'domains'] as const
type CatalogTab = typeof VALID_CATALOG_TABS[number]

export default function DataCatalogPage() {
  const { tab } = useParams<{ tab?: string }>()
  const navigate = useNavigate()

  const activeTab: CatalogTab = useMemo(() => {
    if (tab && (VALID_CATALOG_TABS as readonly string[]).includes(tab)) {
      return tab as CatalogTab
    }
    return 'platforms'
  }, [tab])

  useEffect(() => {
    if (tab !== activeTab) {
      navigate(`/catalog/${activeTab}`, { replace: true })
    }
  }, [tab, activeTab, navigate])

  const handleTabChange = (val: string | null) => {
    if (val && (VALID_CATALOG_TABS as readonly string[]).includes(val)) {
      navigate(`/catalog/${val}`)
    }
  }

  // Per-tab search states
  const [platformSearch, setPlatformSearch] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [columnFilter, setColumnFilter] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [domainSearch, setDomainSearch] = useState('')

  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null)
  const [selectedDb, setSelectedDb] = useState<number | null>(null)
  const [selectedSchema, setSelectedSchema] = useState<number | null>(null)
  const [selectedTable, setSelectedTable] = useState<number | null>(null)

  const queryClient = useQueryClient()

  // Mutations for on-demand metadata sync
  const syncPlatformMutation = useMutation({
    mutationFn: (pid: number) => metadataApi.syncPlatform(pid),
    onSuccess: (res: any) => {
      const pName = res.data?.platform_name || 'Platform'
      const tables = res.data?.tables_synced ?? 0
      const cols = res.data?.columns_synced ?? 0
      notifications.show({
        title: 'Metadata Synchronized! ⚡',
        message: `Successfully synchronized ${tables} tables and ${cols} columns for ${pName}.`,
        color: 'teal',
        icon: <IconCheck />,
      })
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      queryClient.invalidateQueries({ queryKey: ['schemas'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['celery-task-history'] })
    },
    onError: (err: any) => {
      notifications.show({
        title: 'Sync Failed',
        message: err.response?.data?.detail || err.message || 'Failed to sync metadata',
        color: 'red',
        icon: <IconX />,
      })
    },
  })

  const syncAllMutation = useMutation({
    mutationFn: () => metadataApi.syncAllPlatforms(),
    onSuccess: (res: any) => {
      const tables = res.data?.tables_synced ?? 0
      const cols = res.data?.columns_synced ?? 0
      notifications.show({
        title: 'Full Metadata Sync Complete! ⚡',
        message: `Successfully synchronized ${tables} tables and ${cols} columns across all active cloud data platforms.`,
        color: 'teal',
        icon: <IconCheck />,
      })
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      queryClient.invalidateQueries({ queryKey: ['schemas'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['celery-task-history'] })
    },
    onError: (err: any) => {
      notifications.show({
        title: 'Sync Failed',
        message: err.response?.data?.detail || err.message || 'Failed to sync metadata across platforms',
        color: 'red',
        icon: <IconX />,
      })
    },
  })

  // Data queries
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })
  const databases = useQuery({ queryKey: ['databases', selectedPlatform], queryFn: () => metadataApi.databases(selectedPlatform!), enabled: !!selectedPlatform })
  const schemas = useQuery({ queryKey: ['schemas', selectedDb], queryFn: () => metadataApi.schemas(selectedDb!), enabled: !!selectedDb })
  const tables = useQuery({ queryKey: ['tables', selectedSchema], queryFn: () => metadataApi.tables(selectedSchema!), enabled: !!selectedSchema })
  const columns = useQuery({ queryKey: ['columns', selectedTable], queryFn: () => metadataApi.columns(selectedTable!), enabled: !!selectedTable })
  const products = useQuery({ queryKey: ['products'], queryFn: () => metadataApi.products() })
  const domains = useQuery({ queryKey: ['domains'], queryFn: () => metadataApi.domains() })

  const getList = (res: any) => {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray(res.data)) return res.data
    return []
  }

  const platformList = getList(platforms.data)
  const dbList = getList(databases.data)
  const schemaList = getList(schemas.data)
  const rawTableList = getList(tables.data)
  const rawColumnList = getList(columns.data)
  const productList = getList(products.data)
  const domainList = getList(domains.data)

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
  const currentDbObj = dbList.find((d: any) => d.database_id === selectedDb)
  const currentSchemaObj = schemaList.find((s: any) => s.schema_id === selectedSchema)
  const currentTableObj = rawTableList.find((t: any) => t.table_id === selectedTable)

  // Filtered lists
  const tableList = rawTableList.filter((t: any) =>
    !tableFilter || t.table_name.toLowerCase().includes(tableFilter.toLowerCase())
  )

  const columnList = rawColumnList.filter((c: any) =>
    !columnFilter ||
    c.column_name.toLowerCase().includes(columnFilter.toLowerCase()) ||
    (c.normalized_type && c.normalized_type.toLowerCase().includes(columnFilter.toLowerCase()))
  )

  const filteredPlatformList = platformList.filter((p: any) =>
    !platformSearch ||
    p.platform_name.toLowerCase().includes(platformSearch.toLowerCase()) ||
    p.platform_code.toLowerCase().includes(platformSearch.toLowerCase())
  )

  useEffect(() => {
    if (platformSearch && filteredPlatformList.length > 0) {
      if (!filteredPlatformList.some((p: any) => p.platform_id === selectedPlatform)) {
        setSelectedPlatform(filteredPlatformList[0].platform_id)
      }
    }
  }, [platformSearch, filteredPlatformList, selectedPlatform])

  const filteredProductList = productList.filter((p: any) =>
    !productSearch ||
    p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.domain_name && p.domain_name.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const filteredDomainList = domainList.filter((d: any) => {
    if (!domainSearch) return true
    const q = domainSearch.toLowerCase()
    return (
      d.domain_name.toLowerCase().includes(q) ||
      d.domain_code.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    )
  })

  // ── Domain Management State ──────────────────────────────────────────────────
  const [domainModal, setDomainModal] = useState(false)
  const [editingDomain, setEditingDomain] = useState<any>(null)
  const [dName, setDName] = useState('')
  const [dCode, setDCode] = useState('')
  const [dDesc, setDDesc] = useState('')
  const [dOwner, setDOwner] = useState('')

  // ── Product Management State ─────────────────────────────────────────────────
  const [productModal, setProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [pName, setPName] = useState('')
  const [pCode, setPCode] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pOwner, setPOwner] = useState('')
  const [pSensitivity, setPSensitivity] = useState('INTERNAL')

  // ── Product ↔ Platform Link State ─────────────────────────────────────────────
  const [linkModal, setLinkModal] = useState(false)
  const [linkingProduct, setLinkingProduct] = useState<any>(null)
  const [linkPlatformIds, setLinkPlatformIds] = useState<string[]>([])

  // Domain CRUD mutations
  const createDomainMut = useMutation({
    mutationFn: (data: any) => metadataApi.createDomain(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      notifications.show({ title: 'Domain created', message: 'Data domain created successfully.', color: 'teal', icon: <IconCheck /> })
      setDomainModal(false)
    },
    onError: (err: any) => notifications.show({ title: 'Error', message: err.response?.data?.detail || err.message, color: 'red', icon: <IconX /> }),
  })
  const updateDomainMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => metadataApi.updateDomain(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      notifications.show({ title: 'Domain updated', message: 'Data domain updated successfully.', color: 'teal', icon: <IconCheck /> })
      setDomainModal(false)
    },
    onError: (err: any) => notifications.show({ title: 'Error', message: err.response?.data?.detail || err.message, color: 'red', icon: <IconX /> }),
  })
  const deleteDomainMut = useMutation({
    mutationFn: (id: number) => metadataApi.deleteDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.show({ title: 'Domain archived', message: 'Data domain archived successfully.', color: 'orange' })
    },
    onError: (err: any) => notifications.show({
      title: 'Cannot Archive Domain',
      message: err.response?.data?.detail || err.message,
      color: 'red',
      icon: <IconX />,
    }),
  })

  // Product CRUD mutations
  const createProductMut = useMutation({
    mutationFn: (data: any) => metadataApi.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.show({ title: 'Product created', message: 'Data product created successfully.', color: 'teal', icon: <IconCheck /> })
      setProductModal(false)
    },
    onError: (err: any) => notifications.show({ title: 'Error', message: err.response?.data?.detail || err.message, color: 'red', icon: <IconX /> }),
  })
  const updateProductMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => metadataApi.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.show({ title: 'Product updated', message: 'Data product updated successfully.', color: 'teal', icon: <IconCheck /> })
      setProductModal(false)
    },
    onError: (err: any) => notifications.show({ title: 'Error', message: err.response?.data?.detail || err.message, color: 'red', icon: <IconX /> }),
  })
  const deleteProductMut = useMutation({
    mutationFn: (id: number) => metadataApi.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.show({ title: 'Product archived', message: 'Data product archived successfully.', color: 'orange' })
    },
    onError: (err: any) => notifications.show({
      title: 'Cannot Archive Product',
      message: err.response?.data?.detail || err.message,
      color: 'red',
      icon: <IconX />,
    }),
  })

  // Platform link mutations
  const linkPlatformMut = useMutation({
    mutationFn: ({ productId, platformId }: { productId: number; platformId: number }) =>
      metadataApi.linkProductPlatform(productId, platformId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: any) => notifications.show({ title: 'Link error', message: err.response?.data?.detail || err.message, color: 'red', icon: <IconX /> }),
  })
  const unlinkPlatformMut = useMutation({
    mutationFn: ({ productId, platformId }: { productId: number; platformId: number }) =>
      metadataApi.unlinkProductPlatform(productId, platformId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const openNewDomain = () => {
    setEditingDomain(null)
    setDName(''); setDCode(''); setDDesc(''); setDOwner('')
    setDomainModal(true)
  }

  const openEditDomain = (d: any) => {
    setEditingDomain(d)
    setDName(d.domain_name); setDCode(d.domain_code); setDDesc(d.description || ''); setDOwner(d.domain_owner_ldap || '')
    setDomainModal(true)
  }

  const submitDomain = () => {
    const payload = { domain_name: dName, domain_code: dCode, description: dDesc, domain_owner_ldap: dOwner }
    if (editingDomain) {
      updateDomainMut.mutate({ id: editingDomain.domain_id, data: payload })
    } else {
      createDomainMut.mutate(payload)
    }
  }

  const openNewProduct = (domainId?: number) => {
    setEditingProduct(null)
    setPName(''); setPCode(''); setPDesc(''); setPOwner(''); setPSensitivity('INTERNAL')
    setSelectedDomainId(domainId ? String(domainId) : (domainList.length > 0 ? String(domainList[0].domain_id) : null))
    setProductModal(true)
  }

  const openEditProduct = (p: any) => {
    setEditingProduct(p)
    setPName(p.product_name); setPCode(p.product_code); setPDesc(p.description || '')
    setPOwner(p.product_owner_ldap || ''); setPSensitivity(p.sensitivity_level || 'INTERNAL')
    setSelectedDomainId(String(p.domain_id))
    setProductModal(true)
  }

  const submitProduct = () => {
    const payload = {
      domain_id: parseInt(selectedDomainId || '0'),
      product_name: pName,
      product_code: pCode,
      description: pDesc,
      product_owner_ldap: pOwner,
      sensitivity_level: pSensitivity,
    }
    if (editingProduct) {
      updateProductMut.mutate({ id: editingProduct.product_id, data: payload })
    } else {
      createProductMut.mutate(payload)
    }
  }

  const openLinkPlatform = (product: any) => {
    setLinkingProduct(product)
    const existingIds = (product.linked_platforms || []).map((p: any) => String(p.platform_id))
    setLinkPlatformIds(existingIds)
    setLinkModal(true)
  }

  const savePlatformLinks = async () => {
    if (!linkingProduct) return
    const productId = linkingProduct.product_id
    const existing = (linkingProduct.linked_platforms || []).map((p: any) => String(p.platform_id))
    const toAdd = linkPlatformIds.filter((id) => !existing.includes(id))
    const toRemove = existing.filter((id: string) => !linkPlatformIds.includes(id))
    await Promise.all([
      ...toAdd.map((id) => linkPlatformMut.mutateAsync({ productId, platformId: parseInt(id) })),
      ...toRemove.map((id: string) => unlinkPlatformMut.mutateAsync({ productId, platformId: parseInt(id) })),
    ])
    queryClient.invalidateQueries({ queryKey: ['products'] })
    notifications.show({ title: 'Platform links updated', message: 'Data product platform links saved.', color: 'teal', icon: <IconCheck /> })
    setLinkModal(false)
  }

  // Group products by domain for the tree view
  const productsByDomain = filteredDomainList.map((d: any) => ({
    ...d,
    products: productList.filter((p: any) => p.domain_id === d.domain_id),
  }))

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={2}>Data Catalog & Platform Browser</Title>
          <Text c="dimmed" size="sm">Browse enterprise platform metadata, databases, schemas, tables, and column attributes</Text>
        </Box>
      </Group>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={handleTabChange} color="indigo">
        <Tabs.List>
          <Tabs.Tab value="platforms" leftSection={<IconDatabase size={16} />}>Data Platforms</Tabs.Tab>
          <Tabs.Tab value="products" leftSection={<IconPackage size={16} />}>Data Products ({productList.length})</Tabs.Tab>
          <Tabs.Tab value="domains" leftSection={<IconSitemap size={16} />}>Data Domains ({domainList.length})</Tabs.Tab>
        </Tabs.List>

        {/* ── Data Platforms Tab ─────────────────────────────────────────── */}
        <Tabs.Panel value="platforms" pt="md">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Data Platform Schemas</Text>
                <Text size="xs" c="dimmed">Browse database catalogs, schemas, tables, and column attributes across connected data platforms</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search data platforms..."
                  leftSection={<IconSearch size={14} />}
                  value={platformSearch}
                  onChange={(e) => setPlatformSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={platformSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setPlatformSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  leftSection={<IconRefresh size={16} />}
                  variant="outline"
                  color="indigo"
                  size="sm"
                  loading={syncAllMutation.isPending}
                  onClick={() => syncAllMutation.mutate()}
                >
                  Sync All Platforms
                </Button>
              </Group>
            </Group>

            <Group align="stretch" gap="md" wrap="nowrap">
            {/* Left Sidebar Explorer */}
            <Paper p="md" radius="md" className="explorer-sidebar" style={{ width: 290, minWidth: 290 }}>
              <Stack gap="md">
                <Box>
                  <Group justify="space-between" align="center" mb={4}>
                    <Text size="xs" fw={600} c="dimmed">TARGET PLATFORM</Text>
                    {selectedPlatform && (
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        color="primary"
                        leftSection={<IconRefresh size={12} />}
                        loading={syncPlatformMutation.isPending}
                        onClick={() => syncPlatformMutation.mutate(selectedPlatform)}
                      >
                        Sync
                      </Button>
                    )}
                  </Group>
                  <Select
                    data={filteredPlatformList.map((p: any) => ({
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
                    leftSection={<IconDatabase size={16} />}
                    id="platform-select-dropdown"
                  />
                </Box>

                <Divider />

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
                          <Accordion.Item key={dbObj.database_id} value={String(dbObj.database_id)}>
                            <Accordion.Control p="xs">
                              <Group gap="xs">
                                <ThemeIcon color="indigo" variant="subtle" size="sm">
                                  <IconFolder size={14} />
                                </ThemeIcon>
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
                                        backgroundColor: selectedSchema === sObj.schema_id ? 'var(--nav-active-bg)' : 'transparent',
                                        color: selectedSchema === sObj.schema_id ? 'var(--nav-active-text)' : 'inherit',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedSchema(sObj.schema_id)
                                        setSelectedTable(null)
                                      }}
                                    >
                                      <Group justify="space-between">
                                        <Group gap={6}>
                                          <IconFolderOpen size={13} opacity={0.8} />
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

            {/* Right Content Area */}
            <Card className="enterprise-card" p="lg" radius="md" style={{ flex: 1, minWidth: 0 }}>
              <Stack gap="md">
                {/* Interactive Breadcrumb Bar */}
                <Group justify="space-between" wrap="wrap">
                  <Breadcrumbs separator={<IconChevronRight size={14} opacity={0.5} />}>
                    <Anchor size="xs" fw={600} color="indigo" onClick={() => { setSelectedDb(null); setSelectedSchema(null); setSelectedTable(null) }}>
                      {currentPlatformObj?.platform_name || 'Platform'}
                    </Anchor>
                    {currentDbObj && (
                      <Anchor size="xs" fw={600} color="indigo" onClick={() => { setSelectedSchema(null); setSelectedTable(null) }}>
                        {currentDbObj.database_name}
                      </Anchor>
                    )}
                    {currentSchemaObj && (
                      <Anchor size="xs" fw={600} color="indigo" onClick={() => setSelectedTable(null)}>
                        {currentSchemaObj.schema_name}
                      </Anchor>
                    )}
                    {currentTableObj && (
                      <Text size="xs" fw={600}>{currentTableObj.table_name}</Text>
                    )}
                  </Breadcrumbs>

                  {selectedTable && (
                    <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => setSelectedTable(null)}>
                      Back to Tables List
                    </Button>
                  )}
                </Group>

                <Divider />

                {selectedTable && currentTableObj ? (
                  <Stack gap="md">
                    <Paper p="md" radius="md" className="enterprise-card">
                      <Group justify="space-between" align="flex-start">
                        <Box>
                          <Group gap="xs">
                            <ThemeIcon color="indigo" variant="light" size="md">
                              <IconTable size={18} />
                            </ThemeIcon>
                            <Title order={3}>{currentTableObj.table_name}</Title>
                            <Badge color="indigo" variant="light" size="sm">TABLE</Badge>
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

                    {columns.isLoading ? (
                      <Stack gap="xs">{[...Array(5)].map((_, i) => <Skeleton key={i} height={35} />)}</Stack>
                    ) : columnList.length === 0 ? (
                      <Text size="xs" c="dimmed" ta="center" py="xl">No columns found matching filter.</Text>
                    ) : (
                      <Box style={{ borderRadius: 8, overflow: 'hidden' }}>
                        <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="md">
                          <Table.Thead>
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
                                    <IconColumns size={14} opacity={0.7} />
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
                                      <IconKey size={12} />
                                      <Badge size="xs" color="indigo">PRIMARY KEY</Badge>
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
                      <Box style={{ borderRadius: 8, overflow: 'hidden' }}>
                        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                          <Table.Thead>
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
                                    <ThemeIcon color="indigo" variant="subtle" size="sm">
                                      <IconTable size={16} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600}>{t.table_name}</Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed">{t.row_count_estimate?.toLocaleString() ?? '10,000+'} rows</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Button size="xs" variant="light" color="indigo" leftSection={<IconColumns size={12} />}>
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
                  <Center py="xl">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={64} radius="xl" variant="light" color="indigo">
                        <IconFolderOpen size={36} />
                      </ThemeIcon>
                      <Text fw={600}>Select a Database & Schema</Text>
                      <Text size="xs" c="dimmed">Use the left sidebar tree to select a Database and Schema to view tables and column definitions.</Text>
                    </Stack>
                  </Center>
                )}
              </Stack>
            </Card>
          </Group>
        </Stack>
      </Tabs.Panel>

        {/* ── Data Products Tab ─────────────────────────────────────────────── */}
        <Tabs.Panel value="products" pt="md">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Data Products Catalog</Text>
                <Text size="xs" c="dimmed">Discover enterprise data products, sensitivity classifications, and linked platforms</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search data products..."
                  leftSection={<IconSearch size={14} />}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={productSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setProductSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  color="violet"
                  variant="filled"
                  size="sm"
                  onClick={() => openNewProduct()}
                >
                  Add Data Product
                </Button>
              </Group>
            </Group>

            {filteredProductList.length === 0 && !products.isLoading && (
              <Center py="xl">
                <Stack align="center" gap="xs">
                  <ThemeIcon size={64} radius="xl" variant="light" color="violet">
                    <IconPackage size={36} />
                  </ThemeIcon>
                  <Text fw={600}>{productSearch ? 'No Matching Products' : 'No Data Products Yet'}</Text>
                  <Text size="xs" c="dimmed">
                    {productSearch ? `No data products matched "${productSearch}".` : 'Create data domains and add products in the Data Domains tab.'}
                  </Text>
                  {!productSearch && (
                    <Button variant="light" color="violet" size="xs" onClick={() => openNewProduct()}>
                      Create First Product
                    </Button>
                  )}
                </Stack>
              </Center>
            )}
            {products.isLoading ? (
              <Stack gap="xs">{[...Array(4)].map((_, i) => <Skeleton key={i} height={80} />)}</Stack>
            ) : filteredProductList.map((p: any) => (
              <Card key={p.product_id} className="glass-card" p="md" radius="md">
                <Group justify="space-between" align="flex-start">
                  <Box style={{ flex: 1 }}>
                    <Group gap="xs" mb={4}>
                      <ThemeIcon size="sm" color="violet" variant="light">
                        <IconPackage size={14} />
                      </ThemeIcon>
                      <Text fw={600} size="sm">{p.product_name}</Text>
                      <Badge size="xs" color={SENSITIVITY_COLORS[p.sensitivity_level] ?? 'gray'} variant="light">
                        {p.sensitivity_level}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" mb="xs">{p.domain_name} · Code: {p.product_code}</Text>
                    {p.description && <Text size="xs" c="dimmed" mb="xs">{p.description}</Text>}
                    {/* Linked Platforms */}
                    {(p.linked_platforms || []).length > 0 && (
                      <Group gap="xs" mt={4}>
                        <Text size="xs" c="dimmed" fw={500}>Platforms:</Text>
                        {(p.linked_platforms || []).map((pl: any) => (
                          <Badge key={pl.platform_id} size="xs" color="indigo" variant="outline" leftSection={<IconPlugConnected size={10} />}>
                            {pl.platform_code}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Box>
                  <Group gap="xs">
                    <Tooltip label="Link / Unlink Platforms">
                      <ActionIcon variant="light" color="indigo" size="sm" onClick={() => openLinkPlatform(p)}>
                        <IconLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Menu shadow="md" width={160}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" size="sm" color="gray">
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => openEditProduct(p)}>Edit Product</Menu.Item>
                        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => deleteProductMut.mutate(p.product_id)}>Archive</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>

        {/* ── Data Domains Tab ─────────────────────────────────────────────── */}
        <Tabs.Panel value="domains" pt="md">
          <Stack gap="md">
            {/* Toolbar */}
            <Group justify="space-between" wrap="wrap">
              <Box>
                <Text fw={600}>Data Domain Hierarchy</Text>
                <Text size="xs" c="dimmed">Manage data domains, add products under domains, and link data platforms under products</Text>
              </Box>
              <Group gap="xs">
                <TextInput
                  placeholder="Search domains..."
                  leftSection={<IconSearch size={14} />}
                  value={domainSearch}
                  onChange={(e) => setDomainSearch(e.target.value)}
                  size="sm"
                  radius="md"
                  w={240}
                  rightSection={domainSearch ? (
                    <ActionIcon variant="subtle" size="xs" onClick={() => setDomainSearch('')}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  color="indigo"
                  variant="filled"
                  size="sm"
                  onClick={openNewDomain}
                >
                  New Domain
                </Button>
              </Group>
            </Group>

            {/* Domain Tree */}
            {domains.isLoading ? (
              <Stack gap="sm">{[...Array(3)].map((_, i) => <Skeleton key={i} height={120} />)}</Stack>
            ) : domainList.length === 0 ? (
              <Center py="xl">
                <Stack align="center" gap="xs">
                  <ThemeIcon size={64} radius="xl" variant="light" color="indigo">
                    <IconSitemap size={36} />
                  </ThemeIcon>
                  <Text fw={600}>No Data Domains</Text>
                  <Text size="xs" c="dimmed">Create your first data domain to start organizing your data products and platforms.</Text>
                  <Button leftSection={<IconPlus size={14} />} variant="light" color="indigo" size="sm" onClick={openNewDomain}>
                    Create First Domain
                  </Button>
                </Stack>
              </Center>
            ) : (
              <Accordion variant="separated" radius="md" chevronPosition="right" multiple>
                {productsByDomain.map((domain: any) => (
                  <Accordion.Item key={domain.domain_id} value={String(domain.domain_id)}>
                    <Accordion.Control>
                      <Group gap="md" justify="space-between" pr="sm">
                        <Group gap="xs">
                          <ThemeIcon size="md" color="indigo" variant="gradient" gradient={{ from: 'indigo', to: 'violet' }}>
                            <IconSitemap size={16} />
                          </ThemeIcon>
                          <Box>
                            <Group gap="xs">
                              <Text fw={700} size="sm">{domain.domain_name}</Text>
                              <Badge size="xs" color="indigo" variant="outline">{domain.domain_code}</Badge>
                            </Group>
                            <Text size="xs" c="dimmed">{domain.description || 'No description'}</Text>
                          </Box>
                        </Group>
                        <Group gap="xs" onClick={(e) => e.stopPropagation()}>
                          <Badge size="sm" color="violet" variant="light" leftSection={<IconBoxMultiple size={11} />}>
                            {domain.products.length} Products
                          </Badge>
                          <Tooltip label="Add Data Product">
                            <ActionIcon variant="light" color="violet" size="sm" onClick={() => openNewProduct(domain.domain_id)}>
                              <IconPlus size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Edit Domain">
                            <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => openEditDomain(domain)}>
                              <IconEdit size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Archive Domain">
                            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteDomainMut.mutate(domain.domain_id)}>
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                    </Accordion.Control>

                    <Accordion.Panel>
                      <Stack gap="sm" pl="md" pt="xs">
                        {domain.products.length === 0 ? (
                          <Group gap="xs" py="xs">
                            <Text size="xs" c="dimmed">No products in this domain yet.</Text>
                            <Button
                              variant="subtle"
                              size="compact-xs"
                              color="violet"
                              leftSection={<IconPlus size={12} />}
                              onClick={() => openNewProduct(domain.domain_id)}
                            >
                              Add Product
                            </Button>
                          </Group>
                        ) : (
                          domain.products.map((product: any) => (
                            <Card key={product.product_id} className="enterprise-card" p="sm" radius="md" withBorder>
                              <Group justify="space-between" align="flex-start">
                                <Box style={{ flex: 1 }}>
                                  <Group gap="xs" mb={4}>
                                    <ThemeIcon size="xs" color="violet" variant="light" radius="sm">
                                      <IconPackage size={11} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600}>{product.product_name}</Text>
                                    <Badge size="xs" color={SENSITIVITY_COLORS[product.sensitivity_level] ?? 'gray'} variant="light">
                                      {product.sensitivity_level}
                                    </Badge>
                                    <Badge size="xs" color="gray" variant="outline">{product.product_code}</Badge>
                                  </Group>
                                  {product.description && (
                                    <Text size="xs" c="dimmed" mb="xs">{product.description}</Text>
                                  )}
                                  {/* Linked Platforms under this product */}
                                  <Group gap="xs" mt={4}>
                                    <ThemeIcon size="xs" color="indigo" variant="subtle" radius="sm">
                                      <IconPlugConnected size={11} />
                                    </ThemeIcon>
                                    <Text size="xs" c="dimmed" fw={500}>Data Platforms:</Text>
                                    {(product.linked_platforms || []).length === 0 ? (
                                      <Text size="xs" c="dimmed" fs="italic">No platforms linked</Text>
                                    ) : (
                                      (product.linked_platforms || []).map((pl: any) => (
                                        <Badge
                                          key={pl.platform_id}
                                          size="xs"
                                          color="indigo"
                                          variant="dot"
                                          style={{ cursor: 'pointer' }}
                                        >
                                          {pl.platform_name} ({pl.platform_code})
                                        </Badge>
                                      ))
                                    )}
                                    <Tooltip label="Manage Platform Links">
                                      <ActionIcon size="xs" variant="subtle" color="indigo" onClick={() => openLinkPlatform(product)}>
                                        <IconLink size={12} />
                                      </ActionIcon>
                                    </Tooltip>
                                  </Group>
                                </Box>
                                <Group gap={4}>
                                  <Tooltip label="Link Platforms">
                                    <ActionIcon variant="light" color="indigo" size="xs" onClick={() => openLinkPlatform(product)}>
                                      <IconLink size={12} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Edit Product">
                                    <ActionIcon variant="subtle" color="blue" size="xs" onClick={() => openEditProduct(product)}>
                                      <IconEdit size={12} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Archive Product">
                                    <ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteProductMut.mutate(product.product_id)}>
                                      <IconTrash size={12} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Group>
                            </Card>
                          ))
                        )}

                        {/* Add Product inline button */}
                        {domain.products.length > 0 && (
                          <Button
                            variant="subtle"
                            size="compact-xs"
                            color="violet"
                            leftSection={<IconPlus size={12} />}
                            onClick={() => openNewProduct(domain.domain_id)}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            Add Product to {domain.domain_name}
                          </Button>
                        )}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* ── Create / Edit Domain Modal ──────────────────────────────────────── */}
      <Modal
        opened={domainModal}
        onClose={() => setDomainModal(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" color="indigo" variant="light"><IconSitemap size={16} /></ThemeIcon>
            <Text fw={700}>{editingDomain ? 'Edit Data Domain' : 'New Data Domain'}</Text>
          </Group>
        }
        radius="md"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Domain Name"
            placeholder="e.g. Revenue Analytics"
            value={dName}
            onChange={(e) => setDName(e.target.value)}
            required
          />
          <TextInput
            label="Domain Code"
            placeholder="e.g. DOM_REV"
            value={dCode}
            onChange={(e) => setDCode(e.target.value.toUpperCase())}
            required
            disabled={!!editingDomain}
            description={editingDomain ? 'Domain code cannot be changed after creation' : 'Unique uppercase code identifier'}
          />
          <TextInput
            label="Description"
            placeholder="Describe the purpose of this data domain..."
            value={dDesc}
            onChange={(e) => setDDesc(e.target.value)}
          />
          <TextInput
            label="Domain Owner (LDAP)"
            placeholder="ldap://ou=finance,dc=acme,dc=com"
            value={dOwner}
            onChange={(e) => setDOwner(e.target.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={() => setDomainModal(false)}>Cancel</Button>
            <Button
              color="indigo"
              onClick={submitDomain}
              loading={createDomainMut.isPending || updateDomainMut.isPending}
              disabled={!dName || !dCode}
            >
              {editingDomain ? 'Save Changes' : 'Create Domain'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Create / Edit Product Modal ─────────────────────────────────────── */}
      <Modal
        opened={productModal}
        onClose={() => setProductModal(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" color="violet" variant="light"><IconPackage size={16} /></ThemeIcon>
            <Text fw={700}>{editingProduct ? 'Edit Data Product' : 'New Data Product'}</Text>
          </Group>
        }
        radius="md"
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Data Domain"
            placeholder="Select domain..."
            data={domainList.map((d: any) => ({ value: String(d.domain_id), label: `${d.domain_name} (${d.domain_code})` }))}
            value={selectedDomainId}
            onChange={setSelectedDomainId}
            required
          />
          <TextInput
            label="Product Name"
            placeholder="e.g. Customer Profiles Core"
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            required
          />
          <TextInput
            label="Product Code"
            placeholder="e.g. PROD_CUST_PROF"
            value={pCode}
            onChange={(e) => setPCode(e.target.value.toUpperCase())}
            required
            disabled={!!editingProduct}
            description={editingProduct ? 'Code cannot be changed after creation' : 'Unique uppercase code'}
          />
          <Select
            label="Sensitivity Level"
            data={SENSITIVITY_OPTIONS}
            value={pSensitivity}
            onChange={(v) => setPSensitivity(v || 'INTERNAL')}
          />
          <TextInput
            label="Description"
            placeholder="Describe this data product..."
            value={pDesc}
            onChange={(e) => setPDesc(e.target.value)}
          />
          <TextInput
            label="Product Owner (LDAP)"
            placeholder="ldap://ou=data,dc=acme,dc=com"
            value={pOwner}
            onChange={(e) => setPOwner(e.target.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={() => setProductModal(false)}>Cancel</Button>
            <Button
              color="violet"
              onClick={submitProduct}
              loading={createProductMut.isPending || updateProductMut.isPending}
              disabled={!pName || !pCode || !selectedDomainId}
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Link Platforms to Product Modal ─────────────────────────────────── */}
      <Modal
        opened={linkModal}
        onClose={() => setLinkModal(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" color="indigo" variant="light"><IconLink size={16} /></ThemeIcon>
            <Text fw={700}>Link Data Platforms to Product</Text>
          </Group>
        }
        radius="md"
        size="md"
      >
        <Stack gap="md">
          {linkingProduct && (
            <Card className="enterprise-card" p="sm" radius="md">
              <Group gap="xs">
                <ThemeIcon size="sm" color="violet" variant="light"><IconPackage size={14} /></ThemeIcon>
                <Box>
                  <Text size="sm" fw={600}>{linkingProduct.product_name}</Text>
                  <Text size="xs" c="dimmed">{linkingProduct.domain_name} · {linkingProduct.product_code}</Text>
                </Box>
              </Group>
            </Card>
          )}
          <MultiSelect
            label="Select Data Platforms to Link"
            description="Select which data platforms are part of this data product"
            placeholder="Choose platforms..."
            data={platformList.map((p: any) => ({
              value: String(p.platform_id),
              label: `${p.platform_name} (${p.platform_code})`,
            }))}
            value={linkPlatformIds}
            onChange={setLinkPlatformIds}
            searchable
            clearable
          />
          {linkPlatformIds.length > 0 && (
            <Box>
              <Text size="xs" fw={600} c="dimmed" mb={6}>LINKED PLATFORMS PREVIEW</Text>
              <Group gap="xs">
                {linkPlatformIds.map((id) => {
                  const pl = platformList.find((p: any) => String(p.platform_id) === id)
                  return pl ? (
                    <Badge
                      key={id}
                      size="sm"
                      color="indigo"
                      variant="light"
                      rightSection={
                        <ActionIcon size="xs" variant="transparent" color="indigo" onClick={() => setLinkPlatformIds(ids => ids.filter(i => i !== id))}>
                          <IconLinkOff size={10} />
                        </ActionIcon>
                      }
                    >
                      {pl.platform_code}
                    </Badge>
                  ) : null
                })}
              </Group>
            </Box>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={() => setLinkModal(false)}>Cancel</Button>
            <Button
              color="indigo"
              leftSection={<IconLink size={16} />}
              onClick={savePlatformLinks}
              loading={linkPlatformMut.isPending || unlinkPlatformMut.isPending}
            >
              Save Platform Links
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
