import { useState, useEffect } from 'react'
import {
  Stack, Title, Text, TextInput, Select, Textarea, Button, Group,
  Stepper, Box, Card, MultiSelect, Badge, Divider, Alert,
  ActionIcon, Paper, Switch, Loader, Autocomplete,
} from '@mantine/core'
import { IconPlus, IconTrash, IconInfoCircle, IconCheck, IconArrowLeft, IconAlertCircle } from '@tabler/icons-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { policiesApi, metadataApi, rbacApi } from '../../api/client'

interface RuleForm {
  rule_name: string; rule_type: 'RBAC' | 'ABAC' | 'COMBINED'; effect: 'ALLOW' | 'DENY'
  subject_role_id: number | null; action_type: string
  mask_type?: string; filter_column?: string; filter_value?: string
  condition_attribute_key?: string; condition_operator?: string; condition_value?: string
}

const defaultRule = (): RuleForm => ({
  rule_name: '', rule_type: 'RBAC', effect: 'ALLOW',
  subject_role_id: null, action_type: 'GRANT_SELECT',
})

export default function PolicyStudioPage() {
  const { id }       = useParams<{ id?: string }>()
  const isEditing    = !!id
  const policyId     = id ? parseInt(id) : null
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const [step, setStep] = useState(0)

  const [policyName,   setPolicyName]   = useState('')
  const [policyCode,   setPolicyCode]   = useState('')
  const [description,  setDescription]  = useState('')
  const [enforceMode,  setEnforceMode]  = useState<'ADVISORY' | 'ENFORCED'>('ADVISORY')
  const [domainId,     setDomainId]     = useState<string | null>(null)
  const [productId,    setProductId]    = useState<string | null>(null)
  const [rules, setRules] = useState<RuleForm[]>([defaultRule()])
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([])

  const existingPolicy = useQuery({
    queryKey: ['policy-detail', policyId],
    queryFn: () => policiesApi.get(policyId!),
    enabled: isEditing && !!policyId,
  })

  useEffect(() => {
    if (isEditing && existingPolicy.data?.data) {
      const p = existingPolicy.data.data
      setPolicyName(p.policy_name || '')
      setPolicyCode(p.policy_code || '')
      setDescription(p.description || '')
      setEnforceMode(p.enforce_mode === 'ENFORCED' ? 'ENFORCED' : 'ADVISORY')
      setDomainId(p.domain_id ? String(p.domain_id) : null)
      setProductId(p.product_id ? String(p.product_id) : null)

      if (p.target_platform_ids && Array.isArray(p.target_platform_ids)) {
        setTargetPlatforms(p.target_platform_ids.map(String))
      }

      // Map rules from current version or versions list
      const curVer = p.current_version ?? p.versions?.find((v: any) => v.is_current) ?? p.versions?.[0]
      const versionRules = curVer?.rules ?? []
      if (versionRules.length > 0) {
        setRules(versionRules.map((r: any) => {
          const roleId = r.subjects?.[0]?.role_id ?? null
          const actionType = r.actions?.[0]?.action_type ?? 'GRANT_SELECT'
          const maskType = r.actions?.[0]?.mask_type
          const filterCol = r.conditions?.[0]?.attribute_key ?? r.actions?.[0]?.filter_column ?? ''
          const filterOp = r.conditions?.[0]?.operator ?? 'EQ'
          const filterVal = r.conditions?.[0]?.compare_value ?? r.actions?.[0]?.filter_value ?? ''

          return {
            rule_name: r.rule_name || '',
            rule_type: (r.rule_type || 'RBAC') as any,
            effect: (r.effect || 'ALLOW') as any,
            subject_role_id: roleId,
            action_type: actionType,
            mask_type: maskType,
            filter_column: filterCol,
            filter_value: filterVal,
            condition_attribute_key: filterCol,
            condition_operator: filterOp,
            condition_value: filterVal,
          }
        }))
      }
    }
  }, [isEditing, existingPolicy.data])

  // Data queries
  const domains    = useQuery({ queryKey: ['domains'],   queryFn: () => metadataApi.domains() })
  const products   = useQuery({ queryKey: ['products', domainId], queryFn: () => metadataApi.products(domainId ? parseInt(domainId) : undefined), enabled: !!domainId })
  const platforms  = useQuery({ queryKey: ['platforms'], queryFn: () => metadataApi.platforms() })
  const roles      = useQuery({ queryKey: ['roles'],     queryFn: () => rbacApi.roles() })
  const attributes = useQuery({ queryKey: ['attributes'],queryFn: () => metadataApi.attributes() })

  const validAttrList: string[] = attributes.data?.data ?? [
    "department", "clearance_level", "cost_center", "office_location", "job_title", "region", "region_code",
    "emp_id", "email", "phone", "first_name", "last_name", "annual_income_usd", "credit_score", "city",
    "customer_id", "payroll_id", "fiscal_year", "gross_revenue", "net_revenue", "ssn", "base_salary_usd"
  ]

  const createMutation = useMutation({
    mutationFn: (data: any) => policiesApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      notifications.show({ message: 'Policy created successfully!', color: 'teal', icon: <IconCheck /> })
      navigate(`/policies/${res.data.policy_id}`)
    },
    onError: (err: any) => {
      notifications.show({ message: err.response?.data?.detail ?? 'Failed to create policy', color: 'red' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => policiesApi.update(policyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      queryClient.invalidateQueries({ queryKey: ['policy-detail', policyId] })
      notifications.show({ message: 'Policy updated successfully!', color: 'teal', icon: <IconCheck /> })
      navigate(`/policies/${policyId}`)
    },
    onError: (err: any) => {
      notifications.show({ message: err.response?.data?.detail ?? 'Failed to update policy', color: 'red' })
    },
  })

  const handleSubmit = () => {
    const payload = {
      policy_name: policyName,
      policy_code: policyCode,
      description,
      enforce_mode: enforceMode,
      domain_id: domainId ? parseInt(domainId) : null,
      product_id: productId ? parseInt(productId) : null,
      target_platform_ids: targetPlatforms.map(p => parseInt(p)),
      rules: rules.map((r, i) => {
        const subjects = r.subject_role_id
          ? [{ subject_type: 'ROLE', role_id: r.subject_role_id }]
          : [{ subject_type: 'ROLE' }]

        const actions = [{
          action_type: r.action_type,
          ...(r.mask_type ? { mask_type: r.mask_type } : {}),
          ...((r.condition_attribute_key || r.filter_column) ? {
            filter_column: r.condition_attribute_key || r.filter_column,
            filter_operator: r.condition_operator || 'EQ',
            filter_value_type: 'LITERAL',
            filter_value: r.condition_value || r.filter_value,
          } : {}),
        }]

        const conditions = (r.condition_attribute_key) ? [{
          condition_group: 1,
          attribute_type: 'USER_ATTRIBUTE',
          attribute_key: r.condition_attribute_key,
          operator: r.condition_operator || 'EQ',
          compare_value_type: 'LITERAL',
          compare_value: r.condition_value || '',
        }] : []

        return {
          rule_name: r.rule_name || `Rule ${i + 1}`,
          rule_type: r.rule_type,
          effect: r.effect,
          rule_order: i + 1,
          subjects,
          actions,
          conditions,
          resources: [],
        }
      }),
    }

    if (isEditing) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(-1)}>
            Back
          </Button>
          <Title order={2}>{isEditing ? `Edit Policy: ${policyName}` : 'Create New Policy'}</Title>
        </Group>
      </Group>

      <Stepper active={step} onStepClick={setStep} color="violet" radius="md">
        <Stepper.Step label="Identity" description="Name and scope">
          <Card p="lg" radius="lg" className="glass-card" mt="md">
            <Stack gap="md">
              <Group grow>
                <TextInput id="policy-name" label="Policy Name" placeholder="e.g. PII Customer Masking Policy"
                  value={policyName} onChange={(e) => setPolicyName(e.target.value)} required />
                <TextInput id="policy-code" label="Policy Code" placeholder="e.g. POL_PII_001"
                  value={policyCode} onChange={(e) => setPolicyCode(e.target.value)} required />
              </Group>
              <Textarea id="description" label="Description" placeholder="Explain policy governance scope..."
                value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              <Group grow>
                <Select id="domain-select" label="Data Domain" placeholder="Select domain..." searchable clearable
                  data={(domains.data?.data ?? []).map((d: any) => ({ value: String(d.domain_id), label: d.domain_name }))}
                  value={domainId} onChange={setDomainId} />
                <Select id="product-select" label="Data Product" placeholder="Select product..." searchable clearable
                  data={(products.data?.data ?? []).map((p: any) => ({ value: String(p.product_id), label: p.product_name }))}
                  value={productId} onChange={setProductId} disabled={!domainId} />
              </Group>
              <Switch id="enforce-mode" label="Enforcement Mode" description="Advisory = audit only; Enforced = active restriction"
                checked={enforceMode === 'ENFORCED'} color="violet"
                onChange={(e) => setEnforceMode(e.currentTarget.checked ? 'ENFORCED' : 'ADVISORY')}
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label="Rules" description="Define access rules">
          <Stack mt="md" gap="md">
            {rules.map((rule, idx) => {
              const attrKey = rule.condition_attribute_key?.trim().toLowerCase() ?? ''
              const isInvalidAttr = !!attrKey && validAttrList.length > 0 && !validAttrList.includes(attrKey)

              return (
                <Card key={idx} p="md" radius="lg" className="glass-card">
                  <Group justify="space-between" mb="md">
                    <Text fw={600} size="sm">Rule {idx + 1}</Text>
                    {rules.length > 1 && (
                      <ActionIcon color="red" variant="subtle"
                        onClick={() => setRules(rules.filter((_, i) => i !== idx))}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                  <Stack gap="sm">
                    <Group grow align="flex-start">
                      <Autocomplete label="Rule Name" placeholder="e.g. Finance Analyst Full Access"
                        data={[
                          'Finance Analyst Full Access',
                          'Mask Email for Non-Admins',
                          'US East Revenue Access',
                          'PII Customer Profile Restriction',
                          'HR Compensation Data Protection',
                          'GL Transactions Audit Filter'
                        ]}
                        value={rule.rule_name}
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, rule_name: v } : r))} />
                      <Select label="Type" data={['RBAC','ABAC','COMBINED']} value={rule.rule_type} searchable
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, rule_type: (v ?? 'RBAC') as any } : r))} />
                      <Select label="Effect" data={['ALLOW','DENY']} value={rule.effect} searchable
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, effect: (v ?? 'ALLOW') as any } : r))} />
                    </Group>
                    <Group grow align="flex-start">
                      <Select label="Subject Role" placeholder="Any role (search...)" clearable searchable
                        data={(roles.data?.data ?? []).map((r: any) => ({ value: String(r.role_id), label: r.role_name }))}
                        value={rule.subject_role_id ? String(rule.subject_role_id) : null}
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, subject_role_id: v ? parseInt(v) : null } : r))} />
                      <Select label="Action" value={rule.action_type} searchable
                        data={['GRANT_SELECT','GRANT_INSERT','GRANT_UPDATE','DENY_ACCESS','MASK_COLUMN','FILTER_ROWS','AUDIT_LOG']}
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, action_type: v ?? 'GRANT_SELECT' } : r))} />
                    </Group>
                    {rule.action_type === 'MASK_COLUMN' && (
                      <Select label="Mask Type" value={rule.mask_type ?? 'NULL_MASK'} searchable
                        data={['NULL_MASK','HASH_SHA256','PARTIAL_MASK','EMAIL_MASK','PHONE_MASK']}
                        onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, mask_type: v ?? undefined } : r))} />
                    )}
                    {(rule.rule_type === 'ABAC' || rule.rule_type === 'COMBINED') && (
                      <>
                        <Divider label="ABAC Condition (optional)" labelPosition="left" />
                        <Group grow align="flex-start">
                          <Stack gap={2} style={{ flex: 1 }}>
                            <Autocomplete
                              label="Attribute Key"
                              placeholder="Search key (e.g. department, emp_id)..."
                              data={validAttrList}
                              value={rule.condition_attribute_key ?? ''}
                              onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, condition_attribute_key: v } : r))}
                              error={isInvalidAttr ? `Unrecognized attribute key '${rule.condition_attribute_key}'. Please select a valid column or attribute.` : undefined}
                            />
                          </Stack>
                          <Select label="Operator" data={['EQ','NEQ','IN','NOT_IN','GT','LT','GTE','LTE','CONTAINS']} searchable
                            value={rule.condition_operator ?? 'EQ'}
                            onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, condition_operator: v ?? 'EQ' } : r))} />
                          <Stack gap={2} style={{ flex: 1 }}>
                            {(() => {
                              const numericAttrKeys = ["account_number", "annual_income_usd", "credit_score", "payroll_id", "fiscal_year", "gross_revenue", "net_revenue", "base_salary_usd", "clicks", "conversions"]
                              const isNumericAttr = numericAttrKeys.includes((rule.condition_attribute_key ?? '').toLowerCase())
                              const isInvalidValueType = isNumericAttr && rule.condition_value && isNaN(Number(rule.condition_value))
                              return (
                                <Autocomplete
                                  label="Value"
                                  placeholder="Search or enter value (e.g. Finance, 10001)..."
                                  data={['Finance', 'HR', 'Marketing', 'US_EAST', 'US_WEST', 'EU_CENTRAL', 'RESTRICTED', 'TOP_SECRET', 'CONFIDENTIAL', 'INTERNAL', 'HIGH', '1', '100', '10001']}
                                  value={rule.condition_value ?? ''}
                                  onChange={(v) => setRules(rules.map((r, i) => i === idx ? { ...r, condition_value: v } : r))}
                                  error={isInvalidValueType ? `'${rule.condition_attribute_key}' requires a numeric value (e.g. 10001), but got non-numeric string '${rule.condition_value}'.` : undefined}
                                />
                              )
                            })()}
                          </Stack>
                        </Group>
                      </>
                    )}
                  </Stack>
                </Card>
              )
            })}
            <Button variant="light" leftSection={<IconPlus size={16} />} color="violet"
              onClick={() => setRules([...rules, defaultRule()])}>
              Add Rule
            </Button>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Platforms" description="Target platforms">
          <Card mt="md" p="lg" radius="lg" className="glass-card">
            <Stack gap="md">
              <Text fw={600}>Select Target Platforms</Text>
              <Text size="sm" c="dimmed">
                Policies will be translated to native constructs on each selected platform.
                After deployment, platforms enforce policies independently.
              </Text>
              <MultiSelect
                id="platform-select"
                label="Target Platforms"
                placeholder="Select platforms..."
                data={(platforms.data?.data ?? []).map((p: any) => ({
                  value: String(p.platform_id), label: p.platform_name,
                }))}
                value={targetPlatforms}
                onChange={setTargetPlatforms}
              />
              {targetPlatforms.length > 0 && (
                <Group gap="xs">
                  {targetPlatforms.map(pid => {
                    const p = (platforms.data?.data ?? []).find((pl: any) => String(pl.platform_id) === pid)
                    return p ? <Badge key={pid} color="violet" variant="light">{p.platform_name}</Badge> : null
                  })}
                </Group>
              )}
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Completed>
          <Card mt="md" p="xl" radius="lg" className="glass-card" ta="center">
            <Stack align="center" gap="md">
              <Box style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <IconCheck size={32} color="white" />
              </Box>
              <Title order={3}>{isEditing ? 'Ready to Save Changes!' : 'Ready to Create!'}</Title>
              <Text c="dimmed">{isEditing ? 'Review your updated policy settings, then click Save Changes.' : 'Review your policy, then click Create Policy to save it as a draft.'}</Text>
              <Paper p="md" radius="md" w="100%" style={{ background: 'rgba(0,0,0,0.3)', textAlign:'left' }}>
                <Text size="sm" ff="monospace">
                  Name: {policyName || '—'}<br/>
                  Code: {policyCode || '—'}<br/>
                  Mode: {enforceMode}<br/>
                  Rules: {rules.length}<br/>
                  Platforms: {targetPlatforms.length}
                </Text>
              </Paper>
            </Stack>
          </Card>
        </Stepper.Completed>
      </Stepper>

      {/* Navigation */}
      <Group justify="space-between" mt="md">
        <Button variant="subtle" onClick={() => navigate(-1)}>Cancel</Button>
        <Group>
          {step > 0 && <Button variant="light" onClick={() => setStep(s => s - 1)}>Back</Button>}
          {step < 3 && (
            <Button color="violet" onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && (!policyName || !policyCode)}>
              Next
            </Button>
          )}
          {step === 3 && (
            <Button color="violet" loading={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}
              id="create-policy-submit"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: 'none' }}>
              {isEditing ? 'Save Changes' : 'Create Policy'}
            </Button>
          )}
        </Group>
      </Group>
    </Stack>
  )
}
