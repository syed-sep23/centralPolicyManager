import { useState, useEffect, useMemo } from 'react'
import {
  Stack, Title, Text, TextInput, Select, Textarea, Button, Group,
  Stepper, Box, Card, MultiSelect, Badge, Alert,
  Paper, Switch, Loader, Tabs, SimpleGrid, ThemeIcon, Code,
  ScrollArea, SegmentedControl,
} from '@mantine/core'
import {
  IconKey, IconFilter, IconShieldLock, IconSparkles, IconCheck,
  IconArrowLeft, IconArrowRight, IconSend, IconCode,
  IconTable, IconColumns, IconUsers, IconUser, IconChecklist,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { policiesApi, metadataApi, rbacApi, connectorApi } from '../../api/client'

// ─── Policy Archetypes (Strictly Ordered) ─────────────────────────────────────
// 1. Data Subscription Policy
// 2. Row-Level Filter Policy
// 3. Data Masking Policy
type PolicyArchetype = 'SUBSCRIPTION_ACCESS' | 'ROW_FILTER' | 'DATA_MASKING'

const ARCHETYPES = [
  {
    type: 'SUBSCRIPTION_ACCESS' as PolicyArchetype,
    title: '1. Data Subscription Policy',
    desc: 'Grant table-level query SELECT access on designated tables across cloud platforms to allowed groups or users.',
    icon: IconKey,
    color: 'teal',
    badge: 'Table Entitlement',
  },
  {
    type: 'ROW_FILTER' as PolicyArchetype,
    title: '2. Row-Level Filter Policy',
    desc: 'Filter table rows dynamically on specified column matching an operator and value for allowed groups or users.',
    icon: IconFilter,
    color: 'blue',
    badge: 'Row Access Control',
  },
  {
    type: 'DATA_MASKING' as PolicyArchetype,
    title: '3. Data Masking Policy',
    desc: 'Obfuscate sensitive table columns (Hash, Email Redact, Partial, Nullify) across selected tables for allowed groups or users.',
    icon: IconShieldLock,
    color: 'violet',
    badge: 'Column-Level Security',
  },
]

const MASKING_TECHNIQUES = [
  { value: 'HASH_SHA256', label: 'Cryptographic Hash (SHA-256)' },
  { value: 'EMAIL_MASK', label: 'Email Redaction (e***@domain.com)' },
  { value: 'PARTIAL_MASK', label: 'Partial Masking (Last 4 digits: ***-**-1234)' },
  { value: 'CONSTANT', label: "Constant Text ('***REDACTED***')" },
  { value: 'NULL_MASK', label: 'Nullify (Return NULL)' },
  { value: 'CUSTOM', label: 'Custom SQL Expression' },
]

const FILTER_OPERATORS = [
  { value: 'EQ', label: 'Equals (=)' },
  { value: 'NEQ', label: 'Not Equals (!=)' },
  { value: 'IN', label: 'In List (IN)' },
  { value: 'CONTAINS', label: 'Contains (LIKE)' },
  { value: 'GT', label: 'Greater Than (>)' },
  { value: 'LT', label: 'Less Than (<)' },
  { value: 'GTE', label: 'Greater Than or Equal (>=)' },
  { value: 'LTE', label: 'Less Than or Equal (<=)' },
]

export default function PolicyStudioPage() {
  const { id } = useParams<{ id?: string }>()
  const isEditing = !!id
  const policyId = id ? parseInt(id) : null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState(0)

  // ─── Step 1: Policy Meta & Archetype ─────────────────────────────────────────
  const [archetype, setArchetype] = useState<PolicyArchetype>('SUBSCRIPTION_ACCESS')
  const [policyName, setPolicyName] = useState('')
  const [policyCode, setPolicyCode] = useState('')
  const [description, setDescription] = useState('')
  const [enforceMode, setEnforceMode] = useState<'ADVISORY' | 'ENFORCED'>('ENFORCED')

  // ─── Step 2: Platform & Tables Scope ─────────────────────────────────────────
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([])
  const [selectedTables, setSelectedTables] = useState<string[]>([])

  // ─── Step 3: Allowed Roles / Users & Action Details ──────────────────────────
  const [allowedSubjectType, setAllowedSubjectType] = useState<'ROLE' | 'USER'>('ROLE')
  const [allowedRoles, setAllowedRoles] = useState<string[]>([])
  const [allowedUsers, setAllowedUsers] = useState<string[]>([])

  // Specific Action Configs:
  // For Row-Level Filter Policy
  const [filterColumn, setFilterColumn] = useState('')
  const [filterOperator, setFilterOperator] = useState('EQ')
  const [filterValue, setFilterValue] = useState('')

  // For Data Masking Policy
  const [selectedMaskColumns, setSelectedMaskColumns] = useState<string[]>([])
  const [targetColumn, setTargetColumn] = useState('EMAIL')
  const [maskType, setMaskType] = useState('HASH_SHA256')
  const [customMaskExpr, setCustomMaskExpr] = useState('SHA2(val, 256)')

  // ─── Step 4: Preview Simulation ──────────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<{
    natural_language: string
    snowflake_sql: string
    redshift_sql: string
    opa_rego: string
  } | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rbacApi.roles() })
  const users = useQuery({ queryKey: ['users-list'], queryFn: () => rbacApi.users(1, 100) })

  // Tables belonging to selected platforms
  const tablesQuery = useQuery({
    queryKey: ['tables-by-platforms', targetPlatforms],
    queryFn: () => metadataApi.tablesByPlatforms(targetPlatforms.map(Number)),
    enabled: targetPlatforms.length > 0,
  })

  // Columns belonging to selected tables
  const columnsQuery = useQuery({
    queryKey: ['columns-by-tables', selectedTables],
    queryFn: () => metadataApi.columnsByTables(selectedTables.map(Number)),
    enabled: selectedTables.length > 0,
  })

  const existing = useQuery({
    queryKey: ['policy-detail', policyId],
    queryFn: () => policiesApi.get(policyId!),
    enabled: isEditing && !!policyId,
  })

  // Load existing policy if editing
  useEffect(() => {
    if (isEditing && existing.data?.data) {
      const p = existing.data.data
      setPolicyName(p.policy_name || '')
      setPolicyCode(p.policy_code || '')
      setDescription(p.description || '')
      setEnforceMode(p.enforce_mode === 'ENFORCED' ? 'ENFORCED' : 'ADVISORY')

      if (p.target_platform_ids && Array.isArray(p.target_platform_ids)) {
        setTargetPlatforms(p.target_platform_ids.map(String))
      }

      const curVer = p.current_version ?? p.versions?.[0]
      const r = curVer?.rules?.[0]
      if (r) {
        const a = r.actions?.[0]
        if (a?.action_type === 'MASK_COLUMN') {
          setArchetype('DATA_MASKING')
          if (a.filter_column) {
            setTargetColumn(a.filter_column)
            setSelectedMaskColumns([a.filter_column])
          }
          setMaskType(a.mask_type || 'HASH_SHA256')
          if (a.mask_expression) setCustomMaskExpr(a.mask_expression)
        } else if (a?.action_type === 'FILTER_ROWS') {
          setArchetype('ROW_FILTER')
          setFilterColumn(a.filter_column || '')
          setFilterOperator(a.filter_operator || 'EQ')
          setFilterValue(a.filter_value || '')
        } else {
          setArchetype('SUBSCRIPTION_ACCESS')
        }

        // Subjects: Roles or Users
        const roleCodes = (r.subjects ?? []).filter((s: any) => s.subject_type === 'ROLE').map((s: any) => s.role_code).filter(Boolean)
        const userIds = (r.subjects ?? []).filter((s: any) => s.subject_type === 'USER').map((s: any) => String(s.user_id)).filter(Boolean)

        if (userIds.length > 0) {
          setAllowedSubjectType('USER')
          setAllowedUsers(userIds)
        } else {
          setAllowedSubjectType('ROLE')
          setAllowedRoles(roleCodes)
        }

        // Resources: Tables
        const tids = (r.resources ?? []).filter((res: any) => res.table_id).map((res: any) => String(res.table_id))
        if (tids.length > 0) {
          setSelectedTables(tids)
        }
      }
    }
  }, [isEditing, existing.data])

  // Options memoization
  const platformOptions = useMemo(() => {
    const raw = platforms.data?.data ?? (Array.isArray(platforms.data) ? platforms.data : [])
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    raw.forEach((p: any) => {
      const val = String(p?.platform_id)
      if (val && !seen.has(val)) {
        seen.add(val)
        opts.push({ value: val, label: `${p.platform_name} (${p.platform_code})` })
      }
    })
    return opts
  }, [platforms.data])

  const availableTables = useMemo(() => {
    return tablesQuery.data?.data ?? []
  }, [tablesQuery.data])

  const tableOptions = useMemo(() => {
    return availableTables.map((t: any) => ({
      value: String(t.table_id),
      label: `${t.database_name}.${t.schema_name}.${t.table_name} (${t.platform_code || t.platform_name})`,
    }))
  }, [availableTables])

  const availableColumns = useMemo(() => {
    return columnsQuery.data?.data ?? []
  }, [columnsQuery.data])

  const columnOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    availableColumns.forEach((c: any) => {
      const name = c.column_name
      if (name && !seen.has(name)) {
        seen.add(name)
        opts.push({
          value: name,
          label: `${name} (${c.data_type || c.normalized_type || 'TEXT'})`,
        })
      }
    })
    return opts
  }, [availableColumns])

  const roleOptions = useMemo(() => {
    const raw = roles.data?.data ?? (Array.isArray(roles.data) ? roles.data : [])
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    raw.forEach((r: any) => {
      if (r?.role_code && !seen.has(r.role_code)) {
        seen.add(r.role_code)
        opts.push({ value: r.role_code, label: `${r.role_name} (${r.role_code})` })
      }
    })
    return opts
  }, [roles.data])

  const rawUsers = useMemo(() => {
    const d = users.data?.data
    if (Array.isArray(d)) return d
    if (d?.items && Array.isArray(d.items)) return d.items
    return []
  }, [users.data])

  const userOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    rawUsers.forEach((u: any) => {
      const val = String(u.user_id)
      if (val && !seen.has(val)) {
        seen.add(val)
        opts.push({
          value: val,
          label: `${u.display_name || u.username} (${u.email || u.username})`,
        })
      }
    })
    return opts
  }, [rawUsers])

  // Automatically update default filter column or mask column when columns are fetched
  useEffect(() => {
    if (columnOptions.length > 0) {
      if (!filterColumn) {
        setFilterColumn(columnOptions[0].value)
      }
      if (selectedMaskColumns.length === 0) {
        // Look for sensitive candidates like EMAIL, SSN, PHONE
        const sensitive = columnOptions.find((c) => /email|ssn|phone|card|balance/i.test(c.value))
        setSelectedMaskColumns([sensitive ? sensitive.value : columnOptions[0].value])
      }
    }
  }, [columnOptions])

  // ─── Live Natural Language Summary Builder ─────────────────────────────────
  const naturalLanguageText = useMemo(() => {
    const targetScopeStr = selectedTables.length
      ? `${selectedTables.length} selected table(s)`
      : targetPlatforms.length
        ? `all tables in [${targetPlatforms.length} platform(s)]`
        : 'all connected data platforms'

    const subjectsStr = allowedSubjectType === 'ROLE'
      ? (allowedRoles.length ? `Groups [${allowedRoles.join(', ')}]` : 'selected identity groups')
      : (allowedUsers.length
        ? `Users [${allowedUsers.map((uid) => rawUsers.find((u: any) => String(u.user_id) === uid)?.username || uid).join(', ')}]`
        : 'selected individual users')

    if (archetype === 'SUBSCRIPTION_ACCESS') {
      return `Grant query SELECT table access on ${targetScopeStr} to allowed ${subjectsStr}.`
    }
    if (archetype === 'ROW_FILTER') {
      const opLabel = FILTER_OPERATORS.find((o) => o.value === filterOperator)?.label || filterOperator
      const valStr = filterValue ? `'${filterValue}'` : '[value]'
      return `Filter rows in ${targetScopeStr} where column '${filterColumn || 'COLUMN'}' ${opLabel} ${valStr} for allowed ${subjectsStr}.`
    }
    if (archetype === 'DATA_MASKING') {
      const maskLabel = MASKING_TECHNIQUES.find((m) => m.value === maskType)?.label || maskType
      const cols = selectedMaskColumns.length ? selectedMaskColumns.join(', ') : targetColumn || 'sensitive columns'
      return `Mask column(s) [${cols}] in ${targetScopeStr} using ${maskLabel} for allowed ${subjectsStr}.`
    }
    return 'Universal policy specification.'
  }, [
    archetype, selectedTables, targetPlatforms, allowedSubjectType, allowedRoles, allowedUsers,
    filterColumn, filterOperator, filterValue, selectedMaskColumns, targetColumn, maskType, rawUsers,
  ])

  // Build draft payload for preview compilation and saving
  const constructDraftPayload = () => {
    const actionType = archetype === 'DATA_MASKING'
      ? 'MASK_COLUMN'
      : archetype === 'ROW_FILTER'
        ? 'FILTER_ROWS'
        : 'GRANT_SELECT'

    const subjects: any[] = []
    if (allowedSubjectType === 'ROLE') {
      allowedRoles.forEach((rCode) => {
        const raw = roles.data?.data ?? (Array.isArray(roles.data) ? roles.data : [])
        const matched = raw.find((r: any) => r.role_code === rCode)
        subjects.push({
          subject_type: 'ROLE',
          role_code: rCode,
          role_id: matched?.role_id ?? 1,
        })
      })
    } else {
      allowedUsers.forEach((uidStr) => {
        const uid = parseInt(uidStr)
        const matched = rawUsers.find((u: any) => u.user_id === uid)
        subjects.push({
          subject_type: 'USER',
          user_id: uid,
          username: matched?.username || `user_${uid}`,
          display_name: matched?.display_name || matched?.username,
        })
      })
    }

    const maskColsStr = selectedMaskColumns.join(', ') || targetColumn

    const actions = [{
      action_type: actionType,
      mask_type: archetype === 'DATA_MASKING' ? maskType : undefined,
      mask_expression: archetype === 'DATA_MASKING' && maskType === 'CUSTOM' ? customMaskExpr : undefined,
      filter_column: archetype === 'DATA_MASKING' ? maskColsStr : archetype === 'ROW_FILTER' ? filterColumn : undefined,
      filter_operator: archetype === 'ROW_FILTER' ? filterOperator : undefined,
      filter_value_type: 'LITERAL',
      filter_value: archetype === 'ROW_FILTER' ? filterValue : undefined,
    }]

    const resources = selectedTables.map((tidStr) => {
      const tid = parseInt(tidStr)
      const t = availableTables.find((tbl: any) => tbl.table_id === tid)
      return {
        platform_id: t?.platform_id || (targetPlatforms[0] ? parseInt(targetPlatforms[0]) : 1),
        database_id: t?.database_id,
        schema_id: t?.schema_id,
        table_id: tid,
        database_name: t?.database_name,
        schema_name: t?.schema_name,
        table_name: t?.table_name,
        resource_scope: 'TABLE',
      }
    })

    if (resources.length === 0) {
      targetPlatforms.forEach((pid) => {
        resources.push({
          platform_id: parseInt(pid),
          resource_scope: 'PLATFORM',
        } as any)
      })
    }

    return {
      policy_name: policyName.trim() || 'CES Security Policy',
      policy_code: policyCode.trim() || 'POLICY_SEC_DEFAULT',
      description: description.trim() || 'Central entitlement policy configured via CES Policy Studio.',
      enforce_mode: enforceMode,
      target_platform_ids: targetPlatforms.map(Number),
      rules: [{
        rule_name: `${archetype} Rule`,
        rule_type: 'COMBINED',
        effect: 'ALLOW',
        subjects,
        actions,
        conditions: [],
        resources,
      }],
    }
  }

  // Trigger preview compilation
  const handleSimulateCompiler = async () => {
    setIsSimulating(true)
    try {
      const draft = constructDraftPayload()

      // 1. Fetch OPA Rego & universal summary from backend
      const backendResp = await policiesApi.previewCompile(draft)
      const baseResult = backendResp.data || {}

      // 2. Fetch Snowflake DDL directly from Snowflake Connector
      let snowflakeSql = '-- Snowflake compilation pending...'
      try {
        const sfResp = await connectorApi.compileSnowflake(draft)
        snowflakeSql = sfResp.data?.compiled_sql || sfResp.data || '-- No Snowflake DDL generated'
      } catch (sfErr: any) {
        snowflakeSql = `-- Snowflake Connector Note: ${sfErr?.response?.data?.detail || sfErr.message || 'Direct connector call failed'}`
      }

      // 3. Fetch Redshift DDL directly from Redshift Connector
      let redshiftSql = '-- Redshift compilation pending...'
      try {
        const rsResp = await connectorApi.compileRedshift(draft)
        redshiftSql = rsResp.data?.compiled_sql || rsResp.data || '-- No Redshift DDL generated'
      } catch (rsErr: any) {
        redshiftSql = `-- Redshift Connector Note: ${rsErr?.response?.data?.detail || rsErr.message || 'Direct connector call failed'}`
      }

      setPreviewResult({
        ...baseResult,
        snowflake_sql: snowflakeSql,
        redshift_sql: redshiftSql,
      })
    } catch (err: any) {
      notifications.show({
        title: 'Simulation Error',
        message: err?.response?.data?.detail || 'Failed to simulate multi-engine DDL compilation',
        color: 'red',
      })
    } finally {
      setIsSimulating(false)
    }
  }

  // Automatically simulate compiler when arriving at Step 3
  useEffect(() => {
    if (activeStep === 3) {
      handleSimulateCompiler()
    }
  }, [activeStep])

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (draft: any) => isEditing ? policiesApi.update(policyId!, draft) : policiesApi.create(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      notifications.show({
        title: 'Policy Saved Successfully',
        message: `Policy ${policyCode} has been saved!`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      })
      navigate('/policies')
    },
    onError: (err: any) => {
      notifications.show({
        title: 'Policy Creation Failed',
        message: err?.response?.data?.detail || 'Error saving policy specification',
        color: 'red',
      })
    },
  })

  // Validation rules
  const isStep1Valid = policyName.trim().length >= 3 && policyCode.trim().length >= 3
  const isStep2Valid = targetPlatforms.length > 0 && selectedTables.length > 0

  const hasAllowedSubject = allowedSubjectType === 'ROLE'
    ? allowedRoles.length > 0
    : allowedUsers.length > 0

  const isStep3Valid = Boolean(
    hasAllowedSubject && (
      archetype === 'SUBSCRIPTION_ACCESS'
        ? true
        : archetype === 'ROW_FILTER'
          ? (filterColumn.trim().length >= 1 && filterValue.trim().length >= 1)
          : (selectedMaskColumns.length > 0 && (maskType !== 'CUSTOM' || customMaskExpr.trim().length >= 3))
    )
  )

  const handleStepClick = (target: number) => {
    if (target === 1 && !isStep1Valid) return
    if (target === 2 && (!isStep1Valid || !isStep2Valid)) return
    if (target === 3 && (!isStep1Valid || !isStep2Valid || !isStep3Valid)) return
    setActiveStep(target)
  }

  return (
    <Stack gap="xl">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Button variant="subtle" size="xs" color="gray" leftSection={<IconArrowLeft size={14} />} onClick={() => navigate('/policies')}>
              Back to Policies
            </Button>
            <Badge color="indigo" variant="filled" size="sm">CES Policy Studio</Badge>
          </Group>
          <Title order={2} mt={4}>
            {isEditing ? `Edit Policy: ${policyName}` : 'Create Entitlement Policy'}
          </Title>
          <Text c="dimmed" size="sm">
            Simple, straight-forward policy creation across your cloud platforms, tables, and identities.
          </Text>
        </Box>
        <Group>
          <Button
            color="indigo"
            leftSection={<IconSend size={16} />}
            loading={saveMutation.isPending}
            disabled={!isStep1Valid || !isStep2Valid || !isStep3Valid}
            onClick={() => saveMutation.mutate(constructDraftPayload())}
          >
            {isEditing ? 'Save Changes' : 'Save & Publish Policy'}
          </Button>
        </Group>
      </Group>

      {/* ── Live Plain English Rule Definition Banner ───────────────────────── */}
      <Paper p="md" radius="md" className="banner-panel" withBorder>
        <Group align="flex-start" gap="sm">
          <ThemeIcon color="indigo" variant="light" size="lg" radius="md">
            <IconSparkles size={20} />
          </ThemeIcon>
          <Box style={{ flex: 1 }}>
            <Group justify="space-between" mb={2}>
              <Text size="xs" fw={700} tt="uppercase" c="indigo">
                Plain English Entitlement Definition
              </Text>
              <Badge size="xs" color={enforceMode === 'ENFORCED' ? 'teal' : 'yellow'} variant="light">
                {enforceMode}
              </Badge>
            </Group>
            <Text size="sm" fw={500} style={{ lineHeight: 1.5 }}>
              {naturalLanguageText}
            </Text>
          </Box>
        </Group>
      </Paper>

      {/* ── Stepper Navigation ────────────────────────────────────────────────── */}
      <Stepper active={activeStep} onStepClick={handleStepClick} color="indigo" radius="md">
        <Stepper.Step label="1. Policy Type" description="Select type & name" />
        <Stepper.Step label="2. Platforms & Tables" description="Target scope" />
        <Stepper.Step label="3. Actions & Allowed Subjects" description="Rules, groups & users" />
        <Stepper.Step label="4. Review & DDL Simulation" description="Multi-cloud SQL preview" />
      </Stepper>

      {/* ── STEP 1: Policy Archetype & Meta ──────────────────────────────────── */}
      {activeStep === 0 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Title order={4} mb="xs">Select Policy Type</Title>
            <Text size="sm" c="dimmed" mb="lg">
              Choose one of the three standard security and entitlement types:
            </Text>

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              {ARCHETYPES.map((arch) => {
                const IconComp = arch.icon
                const isSelected = archetype === arch.type
                return (
                  <Paper
                    key={arch.type}
                    p="md"
                    radius="md"
                    withBorder
                    onClick={() => setArchetype(arch.type)}
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--mantine-color-indigo-6)' : undefined,
                      borderWidth: isSelected ? 2 : 1,
                      backgroundColor: isSelected ? 'var(--nav-active-bg)' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Group justify="space-between" mb="xs">
                      <ThemeIcon color={arch.color} variant={isSelected ? 'filled' : 'light'} size="lg" radius="md">
                        <IconComp size={22} />
                      </ThemeIcon>
                      {isSelected && <Badge color="indigo" size="sm">Selected</Badge>}
                    </Group>
                    <Text fw={700} size="md" mb={4}>{arch.title}</Text>
                    <Text size="xs" c="dimmed" mb="xs">{arch.desc}</Text>
                    <Badge size="xs" variant="outline" color={arch.color}>{arch.badge}</Badge>
                  </Paper>
                )
              })}
            </SimpleGrid>
          </Card>

          <Card withBorder p="lg" radius="md">
            <Title order={4} mb="md">Policy Identification</Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <TextInput
                label="Policy Name"
                placeholder={
                  archetype === 'SUBSCRIPTION_ACCESS'
                    ? 'e.g. Finance Reporting Tables Subscription'
                    : archetype === 'ROW_FILTER'
                      ? 'e.g. US Region Row Visibility Filter'
                      : 'e.g. Customer Email PII Masking'
                }
                required
                error={!isStep1Valid && policyName.length > 0 ? 'Policy Name required (min 3 chars)' : undefined}
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
              <TextInput
                label="Policy Identifier Code"
                placeholder={
                  archetype === 'SUBSCRIPTION_ACCESS'
                    ? 'e.g. POLICY_SUB_FINANCE_TABLES'
                    : archetype === 'ROW_FILTER'
                      ? 'e.g. POLICY_ROW_FILTER_US'
                      : 'e.g. POLICY_MASK_CUSTOMER_EMAIL'
                }
                required
                error={!isStep1Valid && policyCode.length > 0 ? 'Code required (min 3 chars)' : undefined}
                value={policyCode}
                onChange={(e) => setPolicyCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              />
            </SimpleGrid>

            <Textarea
              label="Policy Description"
              placeholder="Brief description of the business justification and access requirements..."
              minRows={2}
              mt="md"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Group justify="space-between" mt="md">
              <Box>
                <Text size="sm" fw={600}>Enforcement Mode</Text>
                <Text size="xs" c="dimmed">
                  {enforceMode === 'ENFORCED'
                    ? 'Active DDL enforcement directly applied to target database query engines.'
                    : 'Advisory mode: Validated and logged to OPA audit trail without altering query results.'}
                </Text>
              </Box>
              <Switch
                size="md"
                color="indigo"
                checked={enforceMode === 'ENFORCED'}
                onChange={(e) => setEnforceMode(e.currentTarget.checked ? 'ENFORCED' : 'ADVISORY')}
                label={enforceMode}
              />
            </Group>
          </Card>

          <Group justify="flex-end">
            <Button
              color="indigo"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep1Valid}
              onClick={() => setActiveStep(1)}
            >
              Continue to Platforms & Tables
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 2: Platforms & Tables Scope ─────────────────────────────────── */}
      {activeStep === 1 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Group justify="space-between" mb="xs">
              <Box>
                <Title order={4}>Choose Data Platforms & Tables</Title>
                <Text size="sm" c="dimmed">
                  Select the cloud platforms, then choose the specific tables to apply this policy to.
                </Text>
              </Box>
              <Badge color="indigo" variant="light">Straightforward Asset Scope</Badge>
            </Group>

            <Stack gap="md" mt="md">
              <MultiSelect
                label="1. Designated Data Platforms"
                description="Select one or more connected platforms (Snowflake, AWS Redshift, PostgreSQL)"
                placeholder="Choose Platforms..."
                data={platformOptions}
                value={targetPlatforms}
                onChange={(vals) => {
                  setTargetPlatforms(vals)
                  // Clear selected tables that no longer belong to selected platforms
                  setSelectedTables([])
                }}
                searchable
                clearable
                required
              />

              {targetPlatforms.length > 0 ? (
                <Box>
                  <MultiSelect
                    label="2. Tables Belonging to Chosen Platforms"
                    description="Select the tables to apply this policy to"
                    placeholder={
                      tablesQuery.isLoading
                        ? 'Loading platform tables...'
                        : tableOptions.length === 0
                          ? 'No tables found for chosen platforms'
                          : 'Select tables (e.g. FINANCE_DB.PUBLIC.CUSTOMER_PROFILES)...'
                    }
                    data={tableOptions}
                    value={selectedTables}
                    onChange={setSelectedTables}
                    searchable
                    clearable
                    required
                    leftSection={<IconTable size={16} />}
                    rightSection={tablesQuery.isLoading ? <Loader size="xs" /> : null}
                  />
                  {selectedTables.length > 0 && (
                    <Paper p="xs" mt="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--mantine-color-indigo-0)' }}>
                      <Group justify="space-between">
                        <Text size="xs" fw={600}>Selected Tables ({selectedTables.length}):</Text>
                        <Badge size="xs" color="indigo">{selectedTables.length} table(s) targeted</Badge>
                      </Group>
                    </Paper>
                  )}
                </Box>
              ) : (
                <Alert color="blue" variant="light" icon={<IconTable size={16} />}>
                  <Text size="xs">
                    Please select at least one Data Platform above to view and choose its tables.
                  </Text>
                </Alert>
              )}
            </Stack>
          </Card>

          <Group justify="space-between">
            <Button variant="default" onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              color="indigo"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep2Valid}
              onClick={() => setActiveStep(2)}
            >
              Continue to Action & Allowed Subjects
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 3: Action Details & Allowed Roles / Users ───────────────────── */}
      {activeStep === 2 && (
        <Stack gap="lg">
          {/* Card A: Allowed Roles or Users */}
          <Card withBorder p="lg" radius="md">
            <Group justify="space-between" mb="xs">
              <Box>
                <Title order={4}>Apply Policy To: Allowed Groups or Users</Title>
                <Text size="sm" c="dimmed">
                  Choose whether this policy applies to identity groups or specific individual users.
                </Text>
              </Box>
              <SegmentedControl
                value={allowedSubjectType}
                onChange={(val) => setAllowedSubjectType(val as 'ROLE' | 'USER')}
                data={[
                  { label: '👥 Identity Groups', value: 'ROLE' },
                  { label: '👤 Specific Users', value: 'USER' },
                ]}
                color="indigo"
              />
            </Group>

            <Stack gap="md" mt="md">
              {allowedSubjectType === 'ROLE' ? (
                <MultiSelect
                  label="Allowed Identity Groups"
                  description="Members of these groups will have this policy applied / be granted access"
                  placeholder="Select Identity Groups (e.g. ROLE_ANALYST, FINANCE_ANALYST)..."
                  data={roleOptions}
                  value={allowedRoles}
                  onChange={setAllowedRoles}
                  searchable
                  clearable
                  required
                  leftSection={<IconUsers size={16} />}
                />
              ) : (
                <MultiSelect
                  label="Allowed Users"
                  description="These specific user accounts will have this policy applied / be granted access"
                  placeholder="Select Users (e.g. alice.chen, frank.nguyen)..."
                  data={userOptions}
                  value={allowedUsers}
                  onChange={setAllowedUsers}
                  searchable
                  clearable
                  required
                  leftSection={<IconUser size={16} />}
                />
              )}
            </Stack>
          </Card>

          {/* Card B: Action Specification per Policy Type */}
          <Card withBorder p="lg" radius="md">
            <Group gap="xs" mb="sm">
              <ThemeIcon color="indigo" variant="light" size="md">
                <IconChecklist size={18} />
              </ThemeIcon>
              <Title order={4}>
                {archetype === 'SUBSCRIPTION_ACCESS' && '1. Data Subscription Configuration'}
                {archetype === 'ROW_FILTER' && '2. Row-Level Filter Specification'}
                {archetype === 'DATA_MASKING' && '3. Data Masking Specification'}
              </Title>
            </Group>

            {/* 1. Data Subscription Policy Action */}
            {archetype === 'SUBSCRIPTION_ACCESS' && (
              <Stack gap="sm">
                <Alert color="teal" variant="light" icon={<IconKey size={18} />}>
                  <Text size="sm" fw={600}>Table-Level Subscription Grant</Text>
                  <Text size="xs" mt={2}>
                    This subscription policy automatically generates native <code>GRANT SELECT</code> privileges on all {selectedTables.length} selected table(s) for the designated {allowedSubjectType === 'ROLE' ? `${allowedRoles.length} allowed group(s)` : `${allowedUsers.length} allowed user(s)`}.
                  </Text>
                </Alert>
                <Paper p="sm" withBorder radius="sm">
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">Permission Level:</Text>
                    <Badge color="teal">SELECT (Query & Read Access)</Badge>
                  </Group>
                  <Group justify="space-between" mt={4}>
                    <Text size="xs" c="dimmed">Target Scope:</Text>
                    <Text size="xs" fw={600}>{selectedTables.length} table(s) across {targetPlatforms.length} platform(s)</Text>
                  </Group>
                </Paper>
              </Stack>
            )}

            {/* 2. Row-Level Filter Policy Action */}
            {archetype === 'ROW_FILTER' && (
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Choose a column belonging to the selected table(s). Rows matching the operator and value will be filtered.
                </Text>

                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                  <Select
                    label="Filter Column"
                    description="Column from selected tables"
                    placeholder={columnOptions.length ? 'Select column...' : 'Enter column name'}
                    data={columnOptions}
                    value={filterColumn}
                    onChange={(val) => val && setFilterColumn(val)}
                    searchable
                    required
                    leftSection={<IconColumns size={16} />}
                  />
                  <Select
                    label="Filter Operator"
                    description="Comparison condition"
                    data={FILTER_OPERATORS}
                    value={filterOperator}
                    onChange={(val) => val && setFilterOperator(val)}
                    required
                  />
                  <TextInput
                    label="Filter Value"
                    description="Value to filter against"
                    placeholder="e.g. US_WEST or 1000 or ACTIVE"
                    required
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  />
                </SimpleGrid>

                <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
                  <Text size="xs" fw={600}>
                    Active Filter Rule: <code>{filterColumn || 'COLUMN'} {filterOperator} '{filterValue || 'VALUE'}'</code>
                  </Text>
                  <Text size="11px" c="dimmed" mt={2}>
                    Query results on target tables will only expose records matching this criterion for allowed subjects.
                  </Text>
                </Paper>
              </Stack>
            )}

            {/* 3. Data Masking Policy Action */}
            {archetype === 'DATA_MASKING' && (
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Choose the sensitive columns belonging to the selected tables and the masking technique to apply.
                </Text>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <MultiSelect
                    label="Target Column(s) to Mask"
                    description="Columns from selected tables"
                    placeholder={columnOptions.length ? 'Select column(s) to mask...' : 'Enter column name'}
                    data={columnOptions}
                    value={selectedMaskColumns}
                    onChange={setSelectedMaskColumns}
                    searchable
                    clearable
                    required
                    leftSection={<IconColumns size={16} />}
                  />

                  <Select
                    label="Masking Technique"
                    description="Obfuscation method applied to values"
                    data={MASKING_TECHNIQUES}
                    value={maskType}
                    onChange={(val) => val && setMaskType(val)}
                    required
                  />
                </SimpleGrid>

                {maskType === 'CUSTOM' && (
                  <TextInput
                    label="Custom SQL Mask Expression"
                    placeholder="e.g. REGEXP_REPLACE(val, '(.)', '*')"
                    value={customMaskExpr}
                    onChange={(e) => setCustomMaskExpr(e.target.value)}
                  />
                )}

                <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--mantine-color-violet-0)' }}>
                  <Text size="xs" fw={600}>
                    Masking Summary: [{selectedMaskColumns.join(', ') || 'No columns selected'}] → {MASKING_TECHNIQUES.find((m) => m.value === maskType)?.label}
                  </Text>
                </Paper>
              </Stack>
            )}
          </Card>

          <Group justify="space-between">
            <Button variant="default" onClick={() => setActiveStep(1)}>Back</Button>
            <Button
              color="indigo"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep3Valid}
              onClick={() => setActiveStep(3)}
            >
              Review & Simulate Multi-Engine DDL
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 4: Review & Live DDL Simulator ───────────────────────────────── */}
      {activeStep === 3 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Group justify="space-between" mb="sm">
              <Box>
                <Title order={4}>Multi-Engine Live DDL & Security Simulator</Title>
                <Text size="sm" c="dimmed">
                  Universal policy compiled into native SQL DDL for Snowflake, AWS Redshift, and OPA Rego.
                </Text>
              </Box>
              <Button
                size="xs"
                variant="light"
                color="indigo"
                leftSection={isSimulating ? <Loader size={14} /> : <IconCode size={14} />}
                onClick={handleSimulateCompiler}
              >
                Re-simulate Code
              </Button>
            </Group>

            {isSimulating ? (
              <Box py="xl" ta="center">
                <Loader color="indigo" size="md" />
                <Text size="sm" c="dimmed" mt="sm">Compiling DDL across cloud engines...</Text>
              </Box>
            ) : previewResult ? (
              <Tabs defaultValue="redshift" color="indigo">
                <Tabs.List mb="md">
                  <Tabs.Tab value="redshift" leftSection={<Text fw={700}>🔴 AWS Redshift DDL</Text>} />
                  {/*<Tabs.Tab value="snowflake" leftSection={<Text fw={700}>❄️ Snowflake DDL</Text>} />
                  <Tabs.Tab value="opa" leftSection={<Text fw={700}>🛡️ OPA Rego Policy</Text>} />
                  <Tabs.Tab value="json" leftSection={<Text fw={700}>📦 RAW JSON</Text>} />*/}
                </Tabs.List>

                <Tabs.Panel value="redshift">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ backgroundColor: 'var(--ces-surface-code)' }}>
                      {previewResult.redshift_sql}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                {/*<Tabs.Panel value="snowflake">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ backgroundColor: 'var(--ces-surface-code)' }}>
                      {previewResult.snowflake_sql}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                <Tabs.Panel value="opa">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ backgroundColor: 'var(--ces-surface-code)' }}>
                      {previewResult.opa_rego}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                <Tabs.Panel value="json">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ backgroundColor: 'var(--ces-surface-code)' }}>
                      {JSON.stringify(constructDraftPayload(), null, 2)}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>*/}
              </Tabs>
            ) : (
              <Alert color="orange" icon={<IconCode />}>
                Click "Re-simulate Code" to generate multi-cloud DDL definitions.
              </Alert>
            )}
          </Card>

          <Group justify="space-between">
            <Button variant="default" onClick={() => setActiveStep(2)}>Back</Button>
            <Button
              color="indigo"
              size="md"
              leftSection={<IconSend size={18} />}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate(constructDraftPayload())}
            >
              {isEditing ? 'Save Changes' : 'Save & Publish Global Policy'}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}
