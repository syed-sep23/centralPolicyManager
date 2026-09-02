import { useState, useEffect, useMemo } from 'react'
import {
  Stack, Title, Text, TextInput, Select, Textarea, Button, Group,
  Stepper, Box, Card, MultiSelect, Badge, Divider, Alert,
  Paper, Switch, Loader, Tabs, SimpleGrid, ThemeIcon, Code,
  ScrollArea, Tooltip,
} from '@mantine/core'
import {
  IconShieldLock, IconFilter, IconKey, IconSparkles, IconCheck,
  IconArrowLeft, IconArrowRight, IconSend, IconCode, IconTag,
  IconServer, IconUserCheck, IconTarget, IconEye,
} from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { policiesApi, metadataApi, rbacApi, purposesApi } from '../../api/client'

// ─── Policy Archetypes ────────────────────────────────────────────────────────
type PolicyArchetype = 'DATA_MASKING' | 'ROW_FILTER' | 'SUBSCRIPTION_ACCESS'

const ARCHETYPES = [
  {
    type: 'DATA_MASKING' as PolicyArchetype,
    title: 'Data Masking Policy',
    desc: 'Obfuscate sensitive columns (Hash, Email Redact, Partial, Nullify) based on global tags or column names.',
    icon: IconShieldLock,
    color: 'violet',
    badge: 'Column-Level Security',
  },
  {
    type: 'ROW_FILTER' as PolicyArchetype,
    title: 'Row-Level Filter Policy',
    desc: 'Restrict rows dynamically based on user attributes (@user.department, @user.country, or status).',
    icon: IconFilter,
    color: 'blue',
    badge: 'Row Access Control',
  },
  {
    type: 'SUBSCRIPTION_ACCESS' as PolicyArchetype,
    title: 'Data Subscription Policy',
    desc: 'Grant or deny direct table access across data products to authorized roles or business purposes.',
    icon: IconKey,
    color: 'teal',
    badge: 'Table Entitlement',
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

export default function PolicyStudioPage() {
  const { id }       = useParams<{ id?: string }>()
  const isEditing    = !!id
  const policyId     = id ? parseInt(id) : null
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const [activeStep, setActiveStep] = useState(0)

  // ─── Step 1: Policy Meta & Archetype ─────────────────────────────────────────
  const [policyName,   setPolicyName]   = useState('')
  const [policyCode,   setPolicyCode]   = useState('')
  const [description,  setDescription]  = useState('')
  const [enforceMode,  setEnforceMode]  = useState<'ADVISORY' | 'ENFORCED'>('ENFORCED')
  const [archetype,    setArchetype]    = useState<PolicyArchetype>('DATA_MASKING')

  // ─── Step 2: Global Scope & Triggers ─────────────────────────────────────────
  const [scopeType,    setScopeType]    = useState<'GLOBAL_TAG' | 'TARGETED'>('GLOBAL_TAG')
  const [selectedTags, setSelectedTags] = useState<string[]>(['PII.EMAIL'])
  const [domainId,     setDomainId]     = useState<string | null>(null)
  const [productId,    setProductId]    = useState<string | null>(null)
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([])

  // ─── Step 3: Action & Circumstance (Immuta DSL) ──────────────────────────────
  const [targetColumn,     setTargetColumn]     = useState('EMAIL')
  const [maskType,         setMaskType]         = useState('HASH_SHA256')
  const [customMaskExpr,   setCustomMaskExpr]   = useState('SHA2(val, 256)')
  const [filterColumn,     setFilterColumn]     = useState('REGION')
  const [filterOperator,   setFilterOperator]   = useState('EQ')
  const [filterValueType,  setFilterValueType]  = useState<'USER_ATTRIBUTE' | 'LITERAL'>('USER_ATTRIBUTE')
  const [filterValue,      setFilterValue]      = useState('department')

  // Exceptions / Circumstances
  const [exemptRoles,      setExemptRoles]      = useState<string[]>([])
  const [exemptPurposes,   setExemptPurposes]   = useState<string[]>([])
  const [userAttrKey,      setUserAttrKey]      = useState('')
  const [userAttrOp,       setUserAttrOp]       = useState('EQ')
  const [userAttrVal,      setUserAttrVal]      = useState('')

  // ─── Step 4: Preview Simulation ──────────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<{
    natural_language: string
    snowflake_sql: string
    redshift_sql: string
    opa_rego: string
  } | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const domains    = useQuery({ queryKey: ['domains'],    queryFn: () => metadataApi.domains() })
  const products   = useQuery({ queryKey: ['products', domainId], queryFn: () => metadataApi.products(domainId ? parseInt(domainId) : undefined), enabled: !!domainId })
  const platforms  = useQuery({ queryKey: ['platforms'],  queryFn: () => metadataApi.platforms() })
  const roles      = useQuery({ queryKey: ['roles'],      queryFn: () => rbacApi.roles() })
  const tags       = useQuery({ queryKey: ['tags'],       queryFn: () => metadataApi.tags() })
  const purposes   = useQuery({ queryKey: ['purposes'],   queryFn: () => purposesApi.list() })
  const existing   = useQuery({
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
      setDomainId(p.domain_id ? String(p.domain_id) : null)
      setProductId(p.product_id ? String(p.product_id) : null)

      if (p.target_platform_ids && Array.isArray(p.target_platform_ids)) {
        setTargetPlatforms(p.target_platform_ids.map(String))
      }

      const curVer = p.current_version ?? p.versions?.[0]
      const r = curVer?.rules?.[0]
      if (r) {
        const a = r.actions?.[0]
        if (a?.action_type === 'MASK_COLUMN') {
          setArchetype('DATA_MASKING')
          setTargetColumn(a.filter_column || 'EMAIL')
          setMaskType(a.mask_type || 'HASH_SHA256')
        } else if (a?.action_type === 'FILTER_ROWS') {
          setArchetype('ROW_FILTER')
          setFilterColumn(a.filter_column || 'REGION')
          setFilterValue(a.filter_value || 'department')
        } else {
          setArchetype('SUBSCRIPTION_ACCESS')
        }

        const roleCodes = (r.subjects ?? []).map((s: any) => s.role_code).filter(Boolean)
        setExemptRoles(roleCodes)

        if (r.resources && Array.isArray(r.resources)) {
          const tagRes = r.resources.filter((res: any) => res.resource_scope === 'TAG')
          if (tagRes.length > 0) {
            setScopeType('GLOBAL_TAG')
          }
        }
      }
    }
  }, [isEditing, existing.data])

  // Extract query options with deduplication to prevent Mantine MultiSelect key collisions
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

  const purposeOptions = useMemo(() => {
    const raw = purposes.data?.data ?? (Array.isArray(purposes.data) ? purposes.data : [])
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    raw.forEach((pr: any) => {
      if (pr?.purpose_code && !seen.has(pr.purpose_code)) {
        seen.add(pr.purpose_code)
        opts.push({ value: pr.purpose_code, label: `${pr.purpose_name} (${pr.purpose_code})` })
      }
    })
    return opts
  }, [purposes.data])

  const tagOptions = useMemo(() => {
    const raw = tags.data?.data ?? (Array.isArray(tags.data) ? tags.data : [])
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    raw.forEach((t: any) => {
      const val = t?.full_path || t?.tag_name
      if (val && !seen.has(val)) {
        seen.add(val)
        opts.push({ value: val, label: `${val} (${t.tag_category || 'General'})` })
      }
    })
    return opts
  }, [tags.data])

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

  // ─── Live Natural Language Summary Builder (Immuta DSL) ──────────────────────
  const naturalLanguageText = useMemo(() => {
    const targetScopeStr = scopeType === 'GLOBAL_TAG'
      ? (selectedTags.length ? `columns/tables tagged with [${selectedTags.join(', ')}]` : 'all tagged data assets')
      : 'selected connected platforms'

    const exemptions: string[] = []
    if (exemptRoles.length) exemptions.push(`have role [${exemptRoles.join(', ')}]`)
    if (exemptPurposes.length) exemptions.push(`possess purpose [${exemptPurposes.join(', ')}]`)
    if (userAttrKey && userAttrVal) exemptions.push(`user attribute @user.${userAttrKey} ${userAttrOp} '${userAttrVal}'`)

    const exemptClause = exemptions.length ? ` for everyone EXCEPT users who ${exemptions.join(' OR ')}` : ''

    if (archetype === 'DATA_MASKING') {
      const maskLabel = MASKING_TECHNIQUES.find((m) => m.value === maskType)?.label || maskType
      return `Mask values in column '${targetColumn}' across ${targetScopeStr} using ${maskLabel}${exemptClause}.`
    }
    if (archetype === 'ROW_FILTER') {
      const valStr = filterValueType === 'USER_ATTRIBUTE' ? `@user.${filterValue}` : `'${filterValue}'`
      return `Only show rows where ${filterColumn} ${filterOperator} ${valStr} across ${targetScopeStr}${exemptClause}.`
    }
    return `Grant query access across ${targetScopeStr} to users who ${exemptions.length ? exemptions.join(' OR ') : 'are authenticated'}.`
  }, [
    archetype, scopeType, selectedTags, targetColumn, maskType,
    filterColumn, filterOperator, filterValueType, filterValue,
    exemptRoles, exemptPurposes, userAttrKey, userAttrOp, userAttrVal,
  ])

  // Build draft payload for preview compilation and saving
  const constructDraftPayload = () => {
    const actionType = archetype === 'DATA_MASKING'
      ? 'MASK_COLUMN'
      : archetype === 'ROW_FILTER'
      ? 'FILTER_ROWS'
      : 'GRANT_SELECT'

    const conditions: any[] = []
    exemptPurposes.forEach((p) => {
      conditions.push({ attribute_key: 'purpose', operator: 'EQ', compare_value: p })
    })
    if (userAttrKey && userAttrVal) {
      conditions.push({ attribute_key: userAttrKey, operator: userAttrOp, compare_value: userAttrVal })
    }

    const subjects = exemptRoles.map((rCode) => {
      const raw = roles.data?.data ?? (Array.isArray(roles.data) ? roles.data : [])
      const matched = raw.find((r: any) => r.role_code === rCode)
      return {
        subject_type: 'ROLE',
        role_code: rCode,
        role_id: matched?.role_id ?? 1,
      }
    })

    const actions = [{
      action_type: actionType,
      mask_type: archetype === 'DATA_MASKING' ? maskType : undefined,
      mask_expression: archetype === 'DATA_MASKING' && maskType === 'CUSTOM' ? customMaskExpr : undefined,
      filter_column: archetype === 'DATA_MASKING' ? targetColumn : archetype === 'ROW_FILTER' ? filterColumn : undefined,
      filter_operator: archetype === 'ROW_FILTER' ? filterOperator : undefined,
      filter_value_type: archetype === 'ROW_FILTER' ? filterValueType : undefined,
      filter_value: archetype === 'ROW_FILTER' ? filterValue : undefined,
    }]

    const resources = targetPlatforms.map((pid) => ({
      platform_id: parseInt(pid),
      resource_scope: 'TAG',
    }))

    return {
      policy_name: policyName.trim() || 'Immuta Global Security Policy',
      policy_code: policyCode.trim() || 'GLOBAL_SECURITY_POLICY',
      description: description.trim() || 'Global data protection and masking policy configured via Immuta Policy Builder.',
      enforce_mode: enforceMode,
      domain_id: domainId ? parseInt(domainId) : undefined,
      product_id: productId ? parseInt(productId) : undefined,
      target_platform_ids: targetPlatforms.map(Number),
      tags: selectedTags,
      rules: [{
        rule_name: `${archetype} Global Rule`,
        rule_type: 'COMBINED',
        effect: 'ALLOW',
        subjects,
        actions,
        conditions,
        resources,
      }],
    }
  }

  // Trigger preview compilation
  const handleSimulateCompiler = async () => {
    setIsSimulating(true)
    try {
      const draft = constructDraftPayload()
      const resp = await policiesApi.previewCompile(draft)
      setPreviewResult(resp.data)
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
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      notifications.show({
        title: 'Global Policy Created',
        message: `Policy ${policyCode} saved successfully!`,
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

  const isStep1Valid = policyName.trim().length >= 3 && policyCode.trim().length >= 3
  const isStep2Valid = scopeType === 'GLOBAL_TAG' ? selectedTags.length > 0 : targetPlatforms.length > 0
  const isStep3Valid = archetype === 'DATA_MASKING'
    ? Boolean(targetColumn.trim().length >= 2 && (maskType !== 'CUSTOM' || customMaskExpr.trim().length >= 3))
    : archetype === 'ROW_FILTER'
    ? Boolean(filterColumn.trim().length >= 2 && filterValue.trim().length >= 1)
    : Boolean(exemptRoles.length > 0 || exemptPurposes.length > 0 || (userAttrKey.trim().length > 0 && userAttrVal.trim().length > 0))

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
            <Badge color="violet" variant="filled" size="sm">Immuta Global Policy Engine</Badge>
          </Group>
          <Title order={2} mt={4}>
            {isEditing ? `Edit Global Policy: ${policyName}` : 'Immuta Global Policy Builder'}
          </Title>
          <Text c="dimmed" size="sm">
            Compose universal data masking, row-level access control, and subscription policies with global tag triggers across all cloud platforms.
          </Text>
        </Box>
        <Group>
          <Button
            variant="default"
            leftSection={<IconCode size={16} />}
            loading={isSimulating}
            onClick={handleSimulateCompiler}
          >
            Simulate DDL
          </Button>
          <Button
            color="violet"
            leftSection={<IconSend size={16} />}
            loading={saveMutation.isPending}
            disabled={!isStep1Valid || !isStep2Valid || !isStep3Valid}
            onClick={() => saveMutation.mutate(constructDraftPayload())}
          >
            {isEditing ? 'Save Changes' : 'Save & Publish Policy'}
          </Button>
        </Group>
      </Group>

      {/* ── Live Natural Language Sentence Summary Banner ───────────────────── */}
      <Paper p="md" radius="md" style={{ background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(59, 130, 246, 0.12))', border: '1px solid rgba(124, 58, 237, 0.3)' }}>
        <Group align="flex-start" gap="sm">
          <ThemeIcon color="violet" variant="light" size="lg" radius="md">
            <IconSparkles size={20} />
          </ThemeIcon>
          <Box style={{ flex: 1 }}>
            <Group justify="space-between" mb={2}>
              <Text size="xs" fw={700} tt="uppercase" c="violet.4">
                Immuta Plain English Rule Definition
              </Text>
              <Badge size="xs" color={enforceMode === 'ENFORCED' ? 'teal' : 'yellow'} variant="light">
                {enforceMode}
              </Badge>
            </Group>
            <Text size="sm" fw={500} c="white" style={{ lineHeight: 1.5 }}>
              {naturalLanguageText}
            </Text>
          </Box>
        </Group>
      </Paper>

      {/* ── Stepper Navigation ────────────────────────────────────────────────── */}
      <Stepper active={activeStep} onStepClick={handleStepClick} color="violet" radius="md">
        <Stepper.Step label="1. Policy Archetype" description="Intent & metadata" />
        <Stepper.Step label="2. Global Scope" description="Tags & cloud platforms" />
        <Stepper.Step label="3. Rule & Exceptions" description="Immuta Action / Circumstance" />
        <Stepper.Step label="4. Live DDL Simulator" description="Snowflake, Redshift & OPA" />
      </Stepper>

      {/* ── STEP 1: Policy Meta & Archetype Selector ─────────────────────────── */}
      {activeStep === 0 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Title order={4} mb="xs">Select Policy Archetype</Title>
            <Text size="sm" c="dimmed" mb="lg">
              Immuta Global Policies are categorized into three core security primitives.
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
                      borderColor: isSelected ? 'var(--mantine-color-violet-6)' : 'rgba(255,255,255,0.1)',
                      background: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Group justify="space-between" mb="xs">
                      <ThemeIcon color={arch.color} variant={isSelected ? 'filled' : 'light'} size="lg" radius="md">
                        <IconComp size={22} />
                      </ThemeIcon>
                      {isSelected && <Badge color="violet" size="sm">Selected</Badge>}
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
                placeholder="e.g. Global PII Email Masking"
                required
                error={!isStep1Valid && policyName.length > 0 ? 'Policy Name required (min 3 chars)' : undefined}
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
              <TextInput
                label="Policy Identifier Code"
                placeholder="e.g. GLOBAL_MASK_PII_EMAIL"
                required
                error={!isStep1Valid && policyCode.length > 0 ? 'Code required (min 3 chars)' : undefined}
                value={policyCode}
                onChange={(e) => setPolicyCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              />
            </SimpleGrid>

            <Textarea
              label="Business Context & Mandate Description"
              placeholder="Explain GDPR, HIPAA, or corporate data privacy mandate..."
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
                color="violet"
                checked={enforceMode === 'ENFORCED'}
                onChange={(e) => setEnforceMode(e.currentTarget.checked ? 'ENFORCED' : 'ADVISORY')}
                label={enforceMode}
              />
            </Group>
          </Card>

          <Group justify="flex-end">
            <Button
              color="violet"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep1Valid}
              onClick={() => setActiveStep(1)}
            >
              Continue to Scope & Triggers
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 2: Global Scope & Target Triggers ──────────────────────────── */}
      {activeStep === 1 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Title order={4} mb="xs">Where does this policy apply?</Title>
            <Text size="sm" c="dimmed" mb="md">
              Immuta policies can be deployed globally across all present and future assets matching tags, or scoped to specific cloud platforms.
            </Text>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="lg">
              <Paper
                p="md"
                radius="md"
                withBorder
                onClick={() => setScopeType('GLOBAL_TAG')}
                style={{
                  cursor: 'pointer',
                  borderColor: scopeType === 'GLOBAL_TAG' ? 'var(--mantine-color-violet-6)' : 'rgba(255,255,255,0.1)',
                  background: scopeType === 'GLOBAL_TAG' ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <Group gap="sm" mb="xs">
                  <ThemeIcon color="violet" variant="light" size="md"><IconTag size={18} /></ThemeIcon>
                  <Text fw={700}>Global Tag-Based Trigger (Immuta Standard)</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Automatically applies across Snowflake, Redshift, Databricks, PostgreSQL to all tables and columns tagged with sensitive identifiers.
                </Text>
              </Paper>

              <Paper
                p="md"
                radius="md"
                withBorder
                onClick={() => setScopeType('TARGETED')}
                style={{
                  cursor: 'pointer',
                  borderColor: scopeType === 'TARGETED' ? 'var(--mantine-color-violet-6)' : 'rgba(255,255,255,0.1)',
                  background: scopeType === 'TARGETED' ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <Group gap="sm" mb="xs">
                  <ThemeIcon color="blue" variant="light" size="md"><IconServer size={18} /></ThemeIcon>
                  <Text fw={700}>Targeted Platform Scope</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Restrict this policy exclusively to designated connected data platforms, domains, or specific data products.
                </Text>
              </Paper>
            </SimpleGrid>

            {scopeType === 'GLOBAL_TAG' ? (
              <Stack gap="sm">
                <MultiSelect
                  label="Target Column / Table Metadata Tags"
                  description="Policy will automatically bind to any data object carrying these tags"
                  placeholder="Select Tags (e.g. PII.EMAIL, CONFIDENTIAL, FINANCE.SALARY)"
                  data={tagOptions}
                  value={selectedTags}
                  onChange={setSelectedTags}
                  searchable
                  clearable
                />
                <Text size="xs" c="dimmed">
                  💡 When new tables or columns are discovered with these tags, Immuta automatically generates and applies the masking/row policies.
                </Text>
              </Stack>
            ) : (
              <Stack gap="md">
                <MultiSelect
                  label="Designated Cloud Platforms"
                  placeholder="Select Platforms (Snowflake, AWS Redshift, PostgreSQL)"
                  data={platformOptions}
                  value={targetPlatforms}
                  onChange={setTargetPlatforms}
                  searchable
                  clearable
                />
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <Select
                    label="Data Domain (Optional)"
                    placeholder="All Domains"
                    data={(domains.data?.data ?? []).map((d: any) => ({ value: String(d.domain_id), label: d.domain_name }))}
                    value={domainId}
                    onChange={setDomainId}
                    clearable
                  />
                  <Select
                    label="Data Product (Optional)"
                    placeholder="All Data Products"
                    data={(products.data?.data ?? []).map((pr: any) => ({ value: String(pr.product_id), label: pr.product_name }))}
                    value={productId}
                    onChange={setProductId}
                    clearable
                  />
                </SimpleGrid>
              </Stack>
            )}
          </Card>

          <Group justify="space-between">
            <Button variant="default" onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              color="violet"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep2Valid}
              onClick={() => setActiveStep(2)}
            >
              Continue to Action & Circumstances
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 3: Action & Circumstance Composer ───────────────────────────── */}
      {activeStep === 2 && (
        <Stack gap="lg">
          {/* Action Configuration Card */}
          <Card withBorder p="lg" radius="md">
            <Group gap="xs" mb="sm">
              <ThemeIcon color="violet" variant="light" size="md"><IconTarget size={18} /></ThemeIcon>
              <Title order={4}>Step 3A: Configure Action</Title>
            </Group>

            {archetype === 'DATA_MASKING' && (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Target Column Name / Pattern"
                  placeholder="e.g. EMAIL, SSN, PHONE_NUMBER"
                  required
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                />
                <Select
                  label="Masking Technique"
                  data={MASKING_TECHNIQUES}
                  value={maskType}
                  onChange={(val) => val && setMaskType(val)}
                />
                {maskType === 'CUSTOM' && (
                  <Box style={{ gridColumn: 'span 2' }}>
                    <TextInput
                      label="Custom SQL Mask Expression"
                      placeholder="e.g. REGEXP_REPLACE(val, '(.)', '*')"
                      value={customMaskExpr}
                      onChange={(e) => setCustomMaskExpr(e.target.value)}
                    />
                  </Box>
                )}
              </SimpleGrid>
            )}

            {archetype === 'ROW_FILTER' && (
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label="Filter Column"
                  placeholder="e.g. REGION, DEPARTMENT, COUNTRY"
                  required
                  value={filterColumn}
                  onChange={(e) => setFilterColumn(e.target.value)}
                />
                <Select
                  label="Operator"
                  data={[
                    { value: 'EQ', label: 'Equals (=)' },
                    { value: 'NEQ', label: 'Not Equals (!=)' },
                    { value: 'IN', label: 'In List (IN)' },
                    { value: 'CONTAINS', label: 'Contains (LIKE)' },
                    { value: 'GTE', label: 'Greater Than or Equal (>=)' },
                  ]}
                  value={filterOperator}
                  onChange={(val) => val && setFilterOperator(val)}
                />
                <TextInput
                  label="Dynamic User Attribute Match"
                  placeholder="e.g. department, region, clearance_level"
                  required
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                />
              </SimpleGrid>
            )}

            {archetype === 'SUBSCRIPTION_ACCESS' && (
              <Alert color="teal" icon={<IconUserCheck />}>
                Subscription Policy grants query SELECT authorization to designated roles or approved business purposes.
              </Alert>
            )}
          </Card>

          {/* Immuta Circumstance / Exception Engine Card */}
          <Card withBorder p="lg" radius="md">
            <Group gap="xs" mb="xs">
              <ThemeIcon color="orange" variant="light" size="md"><IconShieldLock size={18} /></ThemeIcon>
              <Title order={4}>Step 3B: Circumstances & Exemptions</Title>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Specify who is exempt from this policy: <Text span fw={600} c="white">"FOR EVERYONE EXCEPT users who..."</Text>
            </Text>

            <Stack gap="md">
              <MultiSelect
                label="Exempt Roles"
                description="Users who belong to these roles will see unmasked data or bypass row restrictions"
                placeholder="Select Roles (e.g. DATA_ADMIN, COMPLIANCE_OFFICER, AUDITOR)"
                data={roleOptions}
                value={exemptRoles}
                onChange={setExemptRoles}
                searchable
                clearable
              />

              <MultiSelect
                label="Exempt Business Purposes (PBAC)"
                description="Users querying under these authorized purposes receive unmasked data"
                placeholder="Select Purposes (e.g. FRAUD_DETECTION, REGULATORY_AUDIT)"
                data={purposeOptions}
                value={exemptPurposes}
                onChange={setExemptPurposes}
                searchable
                clearable
              />

              <Divider label="Optional Attribute-Based Exception" labelPosition="center" my="xs" />

              <Group grow>
                <TextInput
                  label="User Attribute Key"
                  placeholder="e.g. clearance_level"
                  value={userAttrKey}
                  onChange={(e) => setUserAttrKey(e.target.value)}
                />
                <Select
                  label="Operator"
                  data={[
                    { value: 'EQ', label: 'Equals (=)' },
                    { value: 'GTE', label: 'Greater Than or Equal (>=)' },
                    { value: 'IN', label: 'In List' },
                  ]}
                  value={userAttrOp}
                  onChange={(val) => val && setUserAttrOp(val)}
                />
                <TextInput
                  label="Required Value"
                  placeholder="e.g. CONFIDENTIAL"
                  value={userAttrVal}
                  onChange={(e) => setUserAttrVal(e.target.value)}
                />
              </Group>
            </Stack>
          </Card>

          <Group justify="space-between">
            <Button variant="default" onClick={() => setActiveStep(1)}>Back</Button>
            <Button
              color="violet"
              rightSection={<IconArrowRight size={16} />}
              disabled={!isStep3Valid}
              onClick={() => setActiveStep(3)}
            >
              Simulate Multi-Engine DDL
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── STEP 4: Multi-Engine Live Compiler Simulation ────────────────────── */}
      {activeStep === 3 && (
        <Stack gap="lg">
          <Card withBorder p="lg" radius="md">
            <Group justify="space-between" mb="sm">
              <Box>
                <Title order={4}>Multi-Engine Live DDL & Security Simulator</Title>
                <Text size="sm" c="dimmed">
                  Immuta compiles your universal policy into native SQL DDL statements for Snowflake, AWS Redshift, and OPA Rego.
                </Text>
              </Box>
              <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={isSimulating ? <Loader size={14} /> : <IconCode size={14} />}
                onClick={handleSimulateCompiler}
              >
                Re-simulate Code
              </Button>
            </Group>

            {isSimulating ? (
              <Box py="xl" ta="center">
                <Loader color="violet" size="md" />
                <Text size="sm" c="dimmed" mt="sm">Compiling DDL across cloud engines...</Text>
              </Box>
            ) : previewResult ? (
              <Tabs defaultValue="snowflake" color="violet">
                <Tabs.List mb="md">
                  <Tabs.Tab value="snowflake" leftSection={<Text fw={700}>❄️ Snowflake DDL</Text>} />
                  <Tabs.Tab value="redshift"  leftSection={<Text fw={700}>🔴 AWS Redshift DDL</Text>} />
                  <Tabs.Tab value="opa"       leftSection={<Text fw={700}>🛡️ OPA Rego Policy</Text>} />
                  <Tabs.Tab value="json"      leftSection={<Text fw={700}>📦 RAW JSON</Text>} />
                </Tabs.List>

                <Tabs.Panel value="snowflake">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ fontSize: 12, borderRadius: 8, background: 'rgba(0,0,0,0.4)', color: '#a7f3d0' }}>
                      {previewResult.snowflake_sql}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                <Tabs.Panel value="redshift">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ fontSize: 12, borderRadius: 8, background: 'rgba(0,0,0,0.4)', color: '#fbcfe8' }}>
                      {previewResult.redshift_sql}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                <Tabs.Panel value="opa">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ fontSize: 12, borderRadius: 8, background: 'rgba(0,0,0,0.4)', color: '#bfdbfe' }}>
                      {previewResult.opa_rego}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>

                <Tabs.Panel value="json">
                  <ScrollArea.Autosize mah={400}>
                    <Code block style={{ fontSize: 12, borderRadius: 8, background: 'rgba(0,0,0,0.4)', color: '#fef08a' }}>
                      {JSON.stringify(constructDraftPayload(), null, 2)}
                    </Code>
                  </ScrollArea.Autosize>
                </Tabs.Panel>
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
              color="violet"
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
