import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { policiesApi, deploymentApi, validationApi, rbacApi } from '../../api/client'
import {
  Stack, Title, Group, Badge, Button, Tabs, Text, Card, Table,
  Timeline, Box, Skeleton, Alert, Code, Divider, Paper, Accordion, Anchor,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRocket, IconHistory, IconShieldCheck, IconAlertCircle, IconArrowLeft, IconEdit, IconCheck, IconX } from '@tabler/icons-react'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'gray', VALIDATED: 'teal', FAILED_VALIDATION: 'red', DEPLOYING: 'yellow', ENFORCED: 'violet', DEPRECATED: 'dark', ROLLBACK: 'orange'
}

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const policyId = parseInt(id!)
  const initialTab = params.get('tab') ?? 'overview'

  const { data, isLoading } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: () => policiesApi.get(policyId),
  })
  const { data: versionsData } = useQuery({
    queryKey: ['policy-versions', policyId],
    queryFn: () => policiesApi.versions(policyId),
  })
  const { data: deployStatus } = useQuery({
    queryKey: ['deploy-status', policyId],
    queryFn: () => deploymentApi.status(policyId),
  })
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rbacApi.roles(),
  })
  const { data: auditData } = useQuery({
    queryKey: ['opa-audit', policyId],
    queryFn: () => validationApi.getAuditLogs(policyId),
  })
  const { data: compiledData } = useQuery({
    queryKey: ['compiled-policy', policyId],
    queryFn: () => deploymentApi.compiled(policyId),
  })

  const submitMutation = useMutation({
    mutationFn: () => policiesApi.submit(policyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
      queryClient.invalidateQueries({ queryKey: ['policy-versions', policyId] })
      queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
      queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
      queryClient.invalidateQueries({ queryKey: ['compiled-policy', policyId] })
      notifications.show({ title: 'OPA Gate Passed ✅', message: 'OPA Decision: Positive. Temporal workflow deployment started.', color: 'teal' })
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
      queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
      const errorMsg = err.response?.data?.detail || 'OPA Policy Evaluation Failed'
      notifications.show({
        title: 'OPA Validation Gate Rejected ❌',
        message: errorMsg,
        color: 'red',
        autoClose: 10000,
      })
    },
  })

  const validateMutation = useMutation({
    mutationFn: () => {
      const currentVerId = policy?.current_version_id || versionsData?.data?.[0]?.version_id || 1
      return validationApi.validate(policyId, currentVerId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
      queryClient.invalidateQueries({ queryKey: ['policy-versions', policyId] })
      queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
      notifications.show({ message: 'OPA Policy Evaluation Executed & Logged to DB', color: 'teal' })
    },
  })

  const policy = data?.data
  if (isLoading) return <Stack gap="md">{[...Array(6)].map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
  if (!policy) return <Alert color="red">Policy not found</Alert>

  const roles = rolesData?.data ?? []

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/policies')}>
            Back
          </Button>
          <Box>
            <Title order={2}>{policy.policy_name}</Title>
            <Group gap="xs" mt={4}>
              <Code>{policy.policy_code}</Code>
              <Badge color={STATUS_COLORS[policy.status] ?? 'gray'}>{policy.status}</Badge>
              <Badge color={policy.enforce_mode === 'ENFORCED' ? 'red' : 'gray'} variant="outline">
                {policy.enforce_mode}
              </Badge>
            </Group>
          </Box>
        </Group>
        <Group>
          <Button variant="light" color="violet" leftSection={<IconEdit size={16} />}
            onClick={() => navigate(`/policies/${policyId}/edit`)}>
            Edit Policy
          </Button>
          <Button leftSection={<IconRocket size={16} />} loading={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: 'none' }}>
            {policy.status === 'ENFORCED' ? 'Re-Deploy Policy' : 'Submit & Deploy'}
          </Button>
        </Group>
      </Group>

      <Tabs defaultValue={initialTab} color="violet">
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconShieldCheck size={16} />}>Overview</Tabs.Tab>
          <Tabs.Tab value="versions" leftSection={<IconHistory size={16} />}>Versions</Tabs.Tab>
          <Tabs.Tab value="opa" leftSection={<IconShieldCheck size={16} />}>OPA Audit & Decisions</Tabs.Tab>
          <Tabs.Tab value="deployments" leftSection={<IconRocket size={16} />}>Deployments</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Card className="glass-card" p="lg">
              <Text fw={600} mb="sm">Policy Details</Text>
              <Table>
                <Table.Tbody>
                  {[
                    ['Description', policy.description ?? '—'],
                    ['Owner User ID', policy.owner_user_id],
                    ['Domain ID', policy.domain_id ?? '—'],
                    ['Product ID', policy.product_id ?? '—'],
                    ['Effective Date', policy.effective_date ?? '—'],
                    ['Expiry Date', policy.expiry_date ?? '—'],
                    ['Created', new Date(policy.created_at).toLocaleString()],
                    ['Last Updated', new Date(policy.updated_at).toLocaleString()],
                  ].map(([k, v]) => (
                    <Table.Tr key={String(k)}>
                      <Table.Td><Text size="sm" c="dimmed" fw={500}>{k}</Text></Table.Td>
                      <Table.Td><Text size="sm">{String(v)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="versions" pt="md">
          {(versionsData?.data ?? []).length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No versions recorded for this policy.</Text>
          ) : (
            <Accordion variant="separated" radius="lg" defaultValue={versionsData?.data?.[0]?.version_id ? String(versionsData.data[0].version_id) : undefined}>
              {(versionsData?.data ?? []).map((v: any) => (
                <Accordion.Item key={v.version_id} value={String(v.version_id)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Accordion.Control>
                    <Group justify="space-between" pr="md">
                      <Group gap="xs">
                        <Badge color={v.is_current ? 'violet' : 'gray'} variant={v.is_current ? 'filled' : 'light'} size="md">
                          v{v.version_number}.0 {v.is_current ? '• Active Version' : ''}
                        </Badge>
                        <Text size="sm" fw={600}>{v.version_label}</Text>
                      </Group>
                      <Group gap="xs">
                        <Badge color={v.status === 'DEPLOYED' ? 'teal' : v.status === 'DRAFT' ? 'gray' : 'yellow'} size="sm">
                          {v.status}
                        </Badge>
                        <Text size="xs" c="dimmed">Authored: {new Date(v.created_at).toLocaleDateString()}</Text>
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="md" pt="xs">
                      {/* Version Metadata */}
                      <Table size="xs" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                        <Table.Tbody>
                          <Table.Tr>
                            <Table.Td c="dimmed" fw={500} w={150}>Change Summary</Table.Td>
                            <Table.Td>{v.change_summary || 'Initial policy draft'}</Table.Td>
                          </Table.Tr>
                          <Table.Tr>
                            <Table.Td c="dimmed" fw={500}>Authored By User</Table.Td>
                            <Table.Td>User ID #{v.authored_by_user_id}</Table.Td>
                          </Table.Tr>
                          <Table.Tr>
                            <Table.Td c="dimmed" fw={500}>Deployed Date</Table.Td>
                            <Table.Td>{v.deployed_at ? new Date(v.deployed_at).toLocaleString() : 'Not deployed yet'}</Table.Td>
                          </Table.Tr>
                        </Table.Tbody>
                      </Table>

                      {/* Deployed Target Platforms */}
                      <Box>
                        <Text size="xs" fw={600} c="dimmed" mb="xs">Target Platforms Deployed ({(v.targets ?? []).length})</Text>
                        {(v.targets ?? []).length === 0 ? (
                          <Text size="xs" c="dimmed" fs="italic">No target platform deployments recorded.</Text>
                        ) : (
                          <Table size="xs" highlightOnHover style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Platform ID</Table.Th>
                                <Table.Th>Platform Code</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Workflow ID</Table.Th>
                                <Table.Th>Deployed Date</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {(v.targets ?? []).map((t: any) => (
                                <Table.Tr key={t.platform_id}>
                                  <Table.Td><Badge color="gray" variant="outline" size="xs">#{t.platform_id}</Badge></Table.Td>
                                  <Table.Td><Badge color="blue" variant="light" size="xs">{t.platform_code}</Badge></Table.Td>
                                  <Table.Td>
                                    <Badge color={t.deployment_status === 'SUCCESS' ? 'green' : t.deployment_status === 'FAILED' ? 'red' : 'yellow'} size="xs">
                                      {t.deployment_status}
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    {t.temporal_workflow_id ? (
                                      <Anchor
                                        href={`http://localhost:8088/namespaces/default/workflows/${t.temporal_workflow_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        size="xs"
                                      >
                                        <Code size="xs" color="violet" style={{ cursor: 'pointer' }}>{t.temporal_workflow_id}</Code>
                                      </Anchor>
                                    ) : (
                                      <Text size="xs" c="dimmed">—</Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>{t.deployed_at ? new Date(t.deployed_at).toLocaleString() : '—'}</Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        )}
                      </Box>

                      {/* Complete Rules Breakdown */}
                      <Box>
                        <Text size="xs" fw={600} c="dimmed" mb="xs">Complete Policy Rules Breakdown ({(v.rules ?? []).length})</Text>
                        {(v.rules ?? []).length === 0 ? (
                          <Text size="xs" c="dimmed" fs="italic">No rules attached to this version.</Text>
                        ) : (
                          <Stack gap="sm">
                            {(v.rules ?? []).map((r: any, rIdx: number) => {
                              const subjectRole = roles.find((role: any) => role.role_id === r.subjects?.[0]?.role_id)?.role_name ?? (r.subjects?.[0]?.subject_type === 'ANY' ? 'Any Role' : '—')
                              return (
                                <Paper key={r.rule_id || rIdx} p="md" radius="md" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                  <Stack gap="xs">
                                    <Group justify="space-between">
                                      <Group gap="xs">
                                        <Text size="sm" fw={600}>{r.rule_name || `Rule ${rIdx + 1}`}</Text>
                                        <Badge size="xs" color={r.effect === 'ALLOW' ? 'green' : 'red'}>{r.effect}</Badge>
                                        <Badge size="xs" color="violet" variant="light">{r.rule_type}</Badge>
                                        <Badge size="xs" color={r.is_active ? 'teal' : 'gray'} variant="outline">
                                          {r.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                      </Group>
                                      <Text size="xs" c="dimmed">Order #{r.rule_order}</Text>
                                    </Group>
                                    {r.rule_description && <Text size="xs" c="dimmed">{r.rule_description}</Text>}

                                    <Divider style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

                                    <Group gap="xl" wrap="wrap">
                                      <Box style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600} mb={2}>Subjects</Text>
                                        {(r.subjects ?? []).map((s: any, sIdx: number) => (
                                          <Text key={sIdx} size="xs">
                                            Type: <Text span fw={500}>{s.subject_type}</Text>
                                            {s.role_id && <> | Role: <Text span fw={500} c="violet">{subjectRole} (ID #{s.role_id})</Text></>}
                                          </Text>
                                        ))}
                                      </Box>

                                      <Box style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600} mb={2}>Actions</Text>
                                        {(r.actions ?? []).map((a: any, aIdx: number) => (
                                          <Text key={aIdx} size="xs">
                                            Type: <Text span fw={500} c="teal">{a.action_type}</Text>
                                            {a.mask_type && <> | Mask: <Code size="xs">{a.mask_type}</Code></>}
                                            {a.filter_column && <> | Filter: <Code size="xs">{a.filter_column} {a.filter_operator} {a.filter_value}</Code></>}
                                          </Text>
                                        ))}
                                      </Box>
                                    </Group>

                                    {(r.conditions ?? []).length > 0 && (
                                      <Box mt="xs">
                                        <Text size="xs" c="dimmed" fw={600} mb={2}>ABAC Conditions</Text>
                                        {(r.conditions ?? []).map((c: any, cIdx: number) => (
                                          <Text key={cIdx} size="xs">
                                            Key: <Text span fw={500}>{c.attribute_key}</Text> | Operator: <Text span fw={500} c="yellow">{c.operator}</Text> | Value: <Text span fw={500}>{c.compare_value}</Text>
                                          </Text>
                                        ))}
                                      </Box>
                                    )}
                                  </Stack>
                                </Paper>
                              )
                            })}
                          </Stack>
                        )}
                      </Box>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="deployments" pt="md">
          <Stack gap="md">
            <Accordion variant="separated" radius="lg" defaultValue="target-platform-deployments">
              <Accordion.Item value="target-platform-deployments" className="glass-card" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <Accordion.Control>
                  <Group justify="space-between" pr="xs">
                    <Text fw={600} size="sm">Target Platform Deployments Status</Text>
                    <Badge color="violet" variant="light" size="xs">
                      {(deployStatus?.data ?? []).length} Platforms
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {(deployStatus?.data ?? []).length === 0 ? (
                    <Text c="dimmed" ta="center" py="xl">
                      No deployments triggered yet. Click "Submit & Deploy" to execute compiler and target deployment.
                    </Text>
                  ) : (
                    <Stack gap="xs" mt="xs">
                      {(deployStatus?.data ?? []).map((d: any, idx: number) => (
                        <Paper key={d.target_id || idx} p="sm" radius="md" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <Group justify="space-between" mb={6}>
                            <Group gap="xs" wrap="wrap">
                              <Badge color="gray" variant="outline" size="xs">#{d.platform_id}</Badge>
                              <Badge color="blue" variant="light" size="xs">{d.platform_code}</Badge>
                              <Badge color={d.workflow_status === 'COMPLETED' ? 'violet' : d.workflow_status === 'RUNNING' ? 'yellow' : 'red'} size="xs">
                                Temporal WF: {d.workflow_status ?? 'COMPLETED'}
                              </Badge>
                              <Badge color={d.deployment_status === 'SUCCESS' ? 'green' : d.deployment_status === 'FAILED' ? 'red' : 'yellow'} size="xs">
                                Platform: {d.deployment_status}
                              </Badge>
                              {d.version_number && (
                                <Badge color="gray" size="xs" variant="dot">v{d.version_number}.0</Badge>
                              )}
                            </Group>
                            {d.deployed_at && <Text size="xs" c="dimmed">{new Date(d.deployed_at).toLocaleString()}</Text>}
                          </Group>
                          <Group gap="md" mb={d.error_message ? 6 : 0}>
                            {d.temporal_workflow_id && (
                              <Text size="xs">
                                Temporal Workflow ID:{' '}
                                <Anchor
                                  href={`http://localhost:8088/namespaces/default/workflows/${d.temporal_workflow_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Code size="xs" color="violet">{d.temporal_workflow_id}</Code>
                                </Anchor>
                              </Text>
                            )}
                            {d.version_label && (
                              <Text size="xs" c="dimmed">Version Label: {d.version_label}</Text>
                            )}
                          </Group>
                          {d.error_message && (
                            <Box mt={4}>
                              <Text size="xs" fw={500} c="dimmed" mb={2}>Connector Execution Message:</Text>
                              <Code block style={{ background: 'rgba(0,0,0,0.4)', color: d.deployment_status === 'SUCCESS' ? '#4ade80' : '#f87171', fontSize: 12 }}>
                                {d.error_message}
                              </Code>
                            </Box>
                          )}
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            {/* Exported Policy Artifacts (Before & After Conversion) */}
            {compiledData?.data && (
              <Card className="glass-card" p="lg" radius="lg">
                <Group justify="space-between" mb="sm">
                  <Box>
                    <Text fw={600} size="md">Compiled Platform SQL DDL & Raw Policy Statements</Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      In-Memory Compiled Security DDL for Policy Version v{compiledData.data.raw_payload?.version_number ?? 1}.0
                    </Text>
                  </Box>
                  <Badge color="violet" variant="light" size="sm">
                    Version v{compiledData.data.raw_payload?.version_number ?? 1}.0
                  </Badge>
                </Group>

                <Tabs defaultValue="snowflake" color="violet">
                  <Tabs.List mb="sm">
                    <Tabs.Tab value="snowflake" leftSection={<Code color="blue" size="xs">SF</Code>}>
                      Snowflake SQL
                    </Tabs.Tab>
                    <Tabs.Tab value="redshift" leftSection={<Code color="red" size="xs">RS</Code>}>
                      Redshift SQL
                    </Tabs.Tab>
                    <Tabs.Tab value="raw_json" leftSection={<Code color="yellow" size="xs">JSON</Code>}>
                      Raw Policy JSON
                    </Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel value="snowflake">
                    <Box style={{ position: 'relative' }}>
                      <Code block style={{ maxHeight: 350, overflow: 'auto', background: 'rgba(0,0,0,0.4)', color: '#38bdf8', fontSize: 12 }}>
                        {compiledData.data.snowflake_sql}
                      </Code>
                    </Box>
                  </Tabs.Panel>

                  <Tabs.Panel value="redshift">
                    <Box style={{ position: 'relative' }}>
                      <Code block style={{ maxHeight: 350, overflow: 'auto', background: 'rgba(0,0,0,0.4)', color: '#f87171', fontSize: 12 }}>
                        {compiledData.data.redshift_sql}
                      </Code>
                    </Box>
                  </Tabs.Panel>

                  <Tabs.Panel value="raw_json">
                    <Box style={{ position: 'relative' }}>
                      <Code block style={{ maxHeight: 350, overflow: 'auto', background: 'rgba(0,0,0,0.4)', color: '#fbbf24', fontSize: 12 }}>
                        {JSON.stringify(compiledData.data.raw_payload, null, 2)}
                      </Code>
                    </Box>
                  </Tabs.Panel>
                </Tabs>
              </Card>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="opa" pt="md">
          <Stack gap="md">
            <Card className="glass-card" p="lg" radius="lg">
              <Group justify="space-between" mb="md">
                <Box>
                  <Text fw={600} size="md">OPA Policy Evaluation & Audit Engine</Text>
                  <Text size="xs" c="dimmed">All policy versions are dynamically evaluated against Open Policy Agent (OPA) Rego rules. Decisions are logged to PostgreSQL DB.</Text>
                </Box>
                <Button
                  size="sm"
                  color="violet"
                  leftSection={<IconShieldCheck size={16} />}
                  loading={validateMutation.isPending}
                  onClick={() => validateMutation.mutate()}
                >
                  Run OPA Evaluation
                </Button>
              </Group>

              {/* Latest Evaluation Result */}
              {validateMutation.data?.data && (
                <Alert
                  title={validateMutation.data.data.is_valid ? "OPA Policy Verdict: APPROVED" : "OPA Policy Verdict: REJECTED"}
                  color={validateMutation.data.data.is_valid ? "green" : "red"}
                  icon={validateMutation.data.data.is_valid ? <IconCheck size={20} /> : <IconX size={20} />}
                  mb="md"
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      Verdict: <Text span fw={600}>{validateMutation.data.data.is_valid ? 'Valid (Approved for Deployment)' : 'Invalid (Rego Rule Violations Detected)'}</Text>
                    </Text>
                    {validateMutation.data.data.errors?.length > 0 && (
                      <Box mt="xs">
                        <Text size="xs" fw={600} c="red" mb={4}>Violations Detected by OPA:</Text>
                        {validateMutation.data.data.errors.map((err: string, i: number) => (
                          <Text key={i} size="xs" c="red">• {err}</Text>
                        ))}
                      </Box>
                    )}
                  </Stack>
                </Alert>
              )}

              {/* Logged OPA Audit Events */}
              <Text fw={600} size="sm" mb="xs" c="dimmed">Logged OPA Decisions in DB ({(auditData?.data?.data ?? []).length} events recorded)</Text>
              {(auditData?.data?.data ?? []).length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="xl">No OPA audit decisions logged yet. Click "Run OPA Evaluation" above to evaluate policy against OPA.</Text>
              ) : (
                <Table highlightOnHover size="xs" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Event ID</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>OPA Verdict</Table.Th>
                      <Table.Th>Actor</Table.Th>
                      <Table.Th>Timestamp</Table.Th>
                      <Table.Th>OPA Evaluation Details & Violations</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(auditData?.data?.data ?? []).map((e: any) => (
                      <Table.Tr key={e.event_id}>
                        <Table.Td><Text size="xs" fw={600} c="dimmed">#{e.event_id}</Text></Table.Td>
                        <Table.Td><Badge size="xs" variant="outline" color="violet">{e.event_type}</Badge></Table.Td>
                        <Table.Td>
                          <Badge color={e.outcome === 'SUCCESS' ? 'green' : 'red'} size="xs">
                            {e.outcome === 'SUCCESS' ? 'APPROVED / ALLOW' : 'REJECTED / DENY'}
                          </Badge>
                        </Table.Td>
                        <Table.Td><Code size="xs">{e.actor_service || 'backend-service'}</Code></Table.Td>
                        <Table.Td><Text size="xs">{new Date(e.event_timestamp).toLocaleString()}</Text></Table.Td>
                        <Table.Td>
                          {e.details?.opa_violations?.length > 0 ? (
                            <Text size="xs" c="red" fw={600}>Violations: {e.details.opa_violations.join('; ')}</Text>
                          ) : e.details?.opa_passed ? (
                            <Text size="xs" c="green" fw={500}>OPA Rego validation passed with zero syntax or rule conflicts</Text>
                          ) : (
                            <Text size="xs" c="dimmed">{JSON.stringify(e.details ?? e.detail_text)}</Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
