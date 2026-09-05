import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { policiesApi, deploymentApi, validationApi, rbacApi, connectorApi } from '../../api/client'
import {
  Stack, Title, Group, Badge, Button, Tabs, Text, Card, Table,
  Timeline, Box, Skeleton, Alert, Code, Divider, Paper, Accordion, Anchor,
  SimpleGrid, ThemeIcon, CopyButton, ActionIcon, Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconRocket, IconHistory, IconShieldCheck, IconAlertCircle, IconArrowLeft,
  IconEdit, IconCheck, IconX, IconChevronDown, IconChevronUp, IconCopy,
  IconTerminal2, IconDatabase, IconServer,
} from '@tabler/icons-react'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'gray', VALIDATED: 'teal', FAILED_VALIDATION: 'red', DEPLOYING: 'yellow', ENFORCED: 'violet', DEPRECATED: 'dark', ROLLBACK: 'orange'
}

const VALID_POLICY_TABS = ['overview', 'versions', 'opa', 'deployments'] as const
type PolicyTab = typeof VALID_POLICY_TABS[number]

export default function PolicyDetailPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const policyId = parseInt(id!)

  const queryTab = params.get('tab')
  const activeTab: PolicyTab = useMemo(() => {
    if (tab && (VALID_POLICY_TABS as readonly string[]).includes(tab)) {
      return tab as PolicyTab
    }
    if (queryTab && (VALID_POLICY_TABS as readonly string[]).includes(queryTab)) {
      return queryTab as PolicyTab
    }
    return 'overview'
  }, [tab, queryTab])

  useEffect(() => {
    if (policyId && tab !== activeTab) {
      navigate(`/policies/${policyId}/${activeTab}`, { replace: true })
    }
  }, [tab, activeTab, policyId, navigate])

  const handleTabChange = (val: string | null) => {
    if (val && (VALID_POLICY_TABS as readonly string[]).includes(val)) {
      navigate(`/policies/${policyId}/${val}`)
    }
  }

  // SSE EventSource tracking and cleanup
  const activeEsRef = useRef<EventSource | null>(null)

  const closeActiveEs = () => {
    if (activeEsRef.current) {
      activeEsRef.current.close()
      activeEsRef.current = null
    }
  }

  // Ensure active SSE connection is cleanly closed when component unmounts
  useEffect(() => {
    return () => {
      closeActiveEs()
    }
  }, [])

  const [deploymentLiveState, setDeploymentLiveState] = useState<{
    step?: string
    status?: string
    message?: string
    platform?: string
    platforms?: any[]
    celery_task_id?: string
    event_id?: string
  } | null>(null)

  const [expandedTaskKeys, setExpandedTaskKeys] = useState<Record<string, boolean>>({})

  const toggleExpand = (key: string) => {
    setExpandedTaskKeys((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }))
  }

  const isRowExpanded = (key: string, idx: number) => {
    if (expandedTaskKeys[key] !== undefined) return expandedTaskKeys[key]
    return idx === 0 // default first (latest) row expanded
  }

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
    queryFn: async () => {
      const res = await deploymentApi.compiled(policyId)
      const base = res.data || {}
      const rawPayload = base.raw_payload

      let sfSql = '-- Snowflake compilation pending...'
      let rsSql = '-- Redshift compilation pending...'

      if (rawPayload) {
        try {
          const sfRes = await connectorApi.compileSnowflake(rawPayload)
          sfSql = sfRes.data?.compiled_sql || sfRes.data || '-- No Snowflake DDL generated'
        } catch (e: any) {
          sfSql = `-- Snowflake Connector Note: ${e?.response?.data?.detail || e.message}`
        }

        try {
          const rsRes = await connectorApi.compileRedshift(rawPayload)
          rsSql = rsRes.data?.compiled_sql || rsRes.data || '-- No Redshift DDL generated'
        } catch (e: any) {
          rsSql = `-- Redshift Connector Note: ${e?.response?.data?.detail || e.message}`
        }
      }

      return {
        data: {
          ...base,
          snowflake_sql: sfSql,
          redshift_sql: rsSql,
        },
      }
    },
  })

  const submitMutation = useMutation({
    mutationFn: () => {
      setDeploymentLiveState({
        step: 'SUBMITTING',
        status: 'IN_PROGRESS',
        message: 'Validating policy specification with OPA Rego evaluation engine...',
      })
      return policiesApi.submit(policyId)
    },
    onSuccess: (res: any) => {
      const eventId = res?.data?.event_id
      const taskId = res?.data?.celery_task_id
      setDeploymentLiveState({
        step: 'DISPATCHED',
        status: 'IN_PROGRESS',
        message: 'OPA Decision: Positive (APPROVED). Celery worker is compiling and deploying policy constructs to Snowflake & Redshift...',
        event_id: eventId,
        celery_task_id: taskId,
      })
      notifications.show({
        title: 'OPA Gate Passed ✅',
        message: 'OPA Decision: Positive. Celery worker is compiling and pushing policy to platforms...',
        color: 'teal',
      })

      if (eventId) {
        closeActiveEs()
        const streamUrl = `/api/v1/deployments/stream/${eventId}`
        const es = new EventSource(streamUrl)
        activeEsRef.current = es

        es.addEventListener('deployment_update', (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data)
            setDeploymentLiveState((prev) => ({ ...prev, ...payload }))
            if (payload.step === 'COMPLETED' || payload.step === 'FAILED') {
              closeActiveEs()
              queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
              queryClient.invalidateQueries({ queryKey: ['policy-versions', policyId] })
              queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
              queryClient.invalidateQueries({ queryKey: ['compiled-policy', policyId] })
              queryClient.invalidateQueries({ queryKey: ['policies-deployments'] })
              queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
              if (payload.status === 'SUCCESS' || payload.step === 'COMPLETED') {
                notifications.show({
                  title: 'Policy Deployed Successfully 🚀',
                  message: payload.message || 'Celery worker has pushed policy constructs to Snowflake & Redshift!',
                  color: 'teal',
                  autoClose: 8000,
                })
              } else {
                notifications.show({
                  title: 'Policy Deployment Encountered Errors ❌',
                  message: payload.message || 'Deployment failed on one or more target data platforms',
                  color: 'red',
                  autoClose: 10000,
                })
              }
            }
          } catch (err) {
            console.error('Failed to parse SSE payload', err)
          }
        })

        es.addEventListener('timeout', () => {
          closeActiveEs()
          queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
          queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
        })

        es.addEventListener('error', () => {
          closeActiveEs()
          queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
          queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
          queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
        })

        es.onerror = () => {
          closeActiveEs()
          queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
          queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
          queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
        queryClient.invalidateQueries({ queryKey: ['deploy-status', policyId] })
        queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
      }
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] })
      queryClient.invalidateQueries({ queryKey: ['opa-audit', policyId] })
      const errorMsg = err.response?.data?.detail || 'OPA Policy Evaluation Failed'
      setDeploymentLiveState({
        step: 'REJECTED',
        status: 'FAILED',
        message: `OPA Gate Rejected: ${errorMsg}`,
      })
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
  const roles = rolesData?.data ?? []
  const allAuditLogs = auditData?.data?.data ?? []

  // Ensure all deployment audit logs are strictly sorted with latest on top (by timestamp DESC, event_id DESC)
  const deploymentAuditLogs = useMemo(() => {
    return allAuditLogs
      .filter((e: any) => e.event_type === 'POLICY_DEPLOYED')
      .sort((a: any, b: any) => {
        const timeA = new Date(a.event_timestamp || 0).getTime()
        const timeB = new Date(b.event_timestamp || 0).getTime()
        if (timeB !== timeA) return timeB - timeA
        return Number(b.event_id || 0) - Number(a.event_id || 0)
      })
  }, [allAuditLogs])

  // Ensure all OPA validation audit logs are strictly sorted with latest on top
  const opaAuditLogs = useMemo(() => {
    return allAuditLogs
      .filter((e: any) => e.event_type === 'OPA_POLICY_VALIDATION')
      .sort((a: any, b: any) => {
        const timeA = new Date(a.event_timestamp || 0).getTime()
        const timeB = new Date(b.event_timestamp || 0).getTime()
        if (timeB !== timeA) return timeB - timeA
        return Number(b.event_id || 0) - Number(a.event_id || 0)
      })
  }, [allAuditLogs])

  const sortedVersions = useMemo(() => {
    return [...(versionsData?.data ?? [])].sort((a: any, b: any) => {
      if (b.version_number !== a.version_number) return Number(b.version_number || 0) - Number(a.version_number || 0)
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })
  }, [versionsData?.data])

  // Unique target data platforms deduplicated by engine code (SNOWFLAKE, REDSHIFT)
  const targetPlatforms = useMemo(() => {
    const list = deployStatus?.data || []
    const map = new Map<string, any>()
    for (const p of list) {
      const code = (p.platform_code || p.platform || '').toUpperCase()
      if (code && !map.has(code)) {
        map.set(code, p)
      }
    }
    return Array.from(map.values())
  }, [deployStatus?.data])

  const latestDeployEvent = deploymentAuditLogs[0]

  const unifiedDeploymentRows = useMemo(() => {
    const rowsByTaskId = new Map<string, any>()

    const formatPlatform = (p: any) => {
      const statusStr = (p.status || p.deployment_status || 'PENDING').toUpperCase()
      const isSuccess = statusStr === 'SUCCESS' || statusStr === 'APPLIED'
      return {
        platform_code: (p.platform_code || p.platform || 'PLATFORM').toUpperCase(),
        platform_id: p.platform_id,
        status: statusStr,
        isSuccess,
        message: p.error_message || p.message || 'Policy applied and enforced successfully via Connector',
      }
    }

    // 1. Process active DB targets (policy_version_targets)
    const activeTargets = deployStatus?.data || []
    if (activeTargets.length > 0) {
      const activeTaskId = activeTargets[0]?.celery_task_id || 'active-targets'
      const rawPlatforms = activeTargets.map(formatPlatform)
      const pMap = new Map<string, any>()
      for (const p of rawPlatforms) {
        if (!pMap.has(p.platform_code)) {
          pMap.set(p.platform_code, p)
        }
      }
      const platforms = Array.from(pMap.values())
      const allSuccess = platforms.every((p: any) => p.isSuccess)
      rowsByTaskId.set(activeTaskId, {
        key: `live-${activeTaskId}`,
        isLive: true,
        eventId: undefined,
        celery_task_id: activeTargets[0]?.celery_task_id,
        version_number: activeTargets[0]?.version_number || policy?.current_version_id || 1,
        actor_service: 'celery_worker',
        celery_worker_status: allSuccess ? 'COMPLETED' : 'DISPATCHED',
        overall_verdict: allSuccess ? 'SUCCESS' : 'FAILED',
        deployed_at: activeTargets[0]?.deployed_at,
        platforms,
      })
    }

    // 2. Process historical audit events from audit_events
    deploymentAuditLogs.forEach((e: any) => {
      const taskId = e.details?.celery_task_id || `event-${e.event_id}`
      const pList: any[] = e.details?.platforms ?? []
      const platforms = pList.length > 0
        ? pList.map(formatPlatform)
        : (deployStatus?.data || []).map(formatPlatform)

      const allSuccess = e.outcome === 'SUCCESS' || (platforms.length > 0 && platforms.every((p: any) => p.isSuccess))

      const existing = rowsByTaskId.get(taskId)
      if (existing) {
        existing.eventId = e.event_id
        existing.deployed_at = existing.deployed_at || e.event_timestamp
        if (pList.length > 0) {
          existing.platforms = platforms
        }
      } else {
        rowsByTaskId.set(taskId, {
          key: `task-${taskId}`,
          isLive: false,
          eventId: e.event_id,
          celery_task_id: e.details?.celery_task_id,
          version_number: e.policy_version_id || policy?.current_version_id || 1,
          actor_service: e.actor_service || 'celery_worker',
          celery_worker_status: allSuccess ? 'COMPLETED' : 'FAILED',
          overall_verdict: allSuccess ? 'SUCCESS' : 'FAILED',
          deployed_at: e.event_timestamp,
          platforms,
        })
      }
    })

    // 3. Real-time Live SSE State (if deployment is triggered in this session)
    if (deploymentLiveState?.celery_task_id || deploymentLiveState?.step) {
      const liveTaskId = deploymentLiveState.celery_task_id || 'live-sse'
      const pList: any[] = deploymentLiveState.platforms || deployStatus?.data || []
      const platforms = pList.map(formatPlatform)
      const isComplete = deploymentLiveState.status === 'SUCCESS'
      const isFailed = deploymentLiveState.status === 'FAILED'

      rowsByTaskId.set(liveTaskId, {
        key: `sse-${liveTaskId}`,
        isLive: true,
        eventId: undefined,
        celery_task_id: deploymentLiveState.celery_task_id,
        version_number: policy?.current_version_id || 1,
        actor_service: 'celery_worker',
        celery_worker_status: isComplete ? 'COMPLETED' : isFailed ? 'FAILED' : (deploymentLiveState.step || 'PROCESSING'),
        overall_verdict: isComplete ? 'SUCCESS' : isFailed ? 'FAILED' : 'PROCESSING',
        deployed_at: new Date().toISOString(),
        platforms,
      })
    }

    // Sort all rows so latest execution is always on top (descending by timestamp and ID)
    const sortedRows = Array.from(rowsByTaskId.values()).sort((a: any, b: any) => {
      // Live in-progress deployment task (PROCESSING) is always strictly on top
      if (a.celery_worker_status === 'PROCESSING' && b.celery_worker_status !== 'PROCESSING') return -1
      if (b.celery_worker_status === 'PROCESSING' && a.celery_worker_status !== 'PROCESSING') return 1

      // Sort by deployed_at descending (latest on top)
      const timeA = new Date(a.deployed_at || 0).getTime()
      const timeB = new Date(b.deployed_at || 0).getTime()
      if (timeB !== timeA) return timeB - timeA

      // Current live active state before older records if timestamps tie
      if (a.isLive && !b.isLive) return -1
      if (b.isLive && !a.isLive) return 1

      // If timestamps tie, sort by eventId descending (higher ID = newer)
      return Number(b.eventId || 0) - Number(a.eventId || 0)
    })

    return sortedRows
  }, [deployStatus?.data, deploymentAuditLogs, deploymentLiveState, policy?.current_version_id])

  let deploymentAlert: {
    title: string
    color: string
    icon: React.ReactNode
    verdictText: string
    message?: string
    taskId?: string
    platforms?: any[]
  } | null = null

  if (deploymentLiveState) {
    const isSuccess = deploymentLiveState.status === 'SUCCESS'
    const isFailed = deploymentLiveState.status === 'FAILED'
    deploymentAlert = {
      title: isSuccess
        ? 'Policy Deployment Verdict: SUCCESS (Enforced on All Engines)'
        : isFailed
          ? 'Policy Deployment Verdict: FAILED (Errors Encountered)'
          : `Policy Deployment In Progress: ${deploymentLiveState.step ?? 'PROCESSING'}`,
      color: isSuccess ? 'green' : isFailed ? 'red' : 'violet',
      icon: isSuccess ? <IconCheck size={20} /> : isFailed ? <IconX size={20} /> : <IconRocket size={20} />,
      verdictText: isSuccess
        ? 'Pushed and Enforced (Live Deployment Successful)'
        : isFailed
          ? 'Deployment Failed (Connector or Compilation Errors)'
          : 'Executing Celery Worker Pipeline...',
      message: deploymentLiveState.message,
      taskId: deploymentLiveState.celery_task_id,
      platforms: deploymentLiveState.platforms,
    }
  } else if (latestDeployEvent) {
    const isSuccess = latestDeployEvent.outcome === 'SUCCESS'
    deploymentAlert = {
      title: isSuccess
        ? 'Latest Policy Deployment Verdict: SUCCESS (Enforced)'
        : 'Latest Policy Deployment Verdict: FAILED',
      color: isSuccess ? 'green' : 'red',
      icon: isSuccess ? <IconCheck size={20} /> : <IconX size={20} />,
      verdictText: isSuccess
        ? 'Enforced on Target Engines via Celery Worker'
        : 'Deployment Encountered Errors',
      message: latestDeployEvent.details?.message,
      taskId: latestDeployEvent.details?.celery_task_id,
      platforms: latestDeployEvent.details?.platforms,
    }
  } else if ((deployStatus?.data ?? []).length > 0) {
    const allSuccess = (deployStatus?.data ?? []).every((d: any) => d.deployment_status === 'SUCCESS')
    deploymentAlert = {
      title: allSuccess
        ? 'Target Platforms Deployment Verdict: ACTIVE & ENFORCED'
        : 'Target Platforms Deployment Status',
      color: allSuccess ? 'green' : 'yellow',
      icon: allSuccess ? <IconCheck size={20} /> : <IconAlertCircle size={20} />,
      verdictText: allSuccess
        ? 'All Platforms Successfully Synchronized'
        : 'Some Platforms Pending or In Progress',
      taskId: (deployStatus?.data ?? [])[0]?.celery_task_id,
      platforms: (deployStatus?.data ?? []).map((d: any) => ({
        platform_code: d.platform_code,
        status: d.deployment_status,
        error_message: d.error_message,
      })),
    }
  }

  const allExpanded = unifiedDeploymentRows.length > 0 && unifiedDeploymentRows.every((r: any, idx: number) => isRowExpanded(r.key, idx))
  const toggleAll = () => {
    const nextState: Record<string, boolean> = {}
    const target = !allExpanded
    unifiedDeploymentRows.forEach((r: any) => {
      nextState[r.key] = target
    })
    setExpandedTaskKeys(nextState)
  }

  if (isLoading) return <Stack gap="md">{[...Array(6)].map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
  if (!policy) return <Text c="dimmed" ta="center" py="xl">Policy not found.</Text>

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
          <Button variant="light" color="indigo" leftSection={<IconEdit size={16} />}
            onClick={() => navigate(`/policies/${policyId}/edit`)}>
            Edit Policy
          </Button>
          <Button leftSection={<IconRocket size={16} />} loading={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            color="indigo" variant="filled">
            {policy.status === 'ENFORCED' ? 'Re-Deploy Policy' : 'Submit & Deploy'}
          </Button>
        </Group>
      </Group>

      <Tabs value={activeTab} onChange={handleTabChange} color="indigo">
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconShieldCheck size={16} />}>Overview</Tabs.Tab>
          <Tabs.Tab value="versions" leftSection={<IconHistory size={16} />}>Versions</Tabs.Tab>
          <Tabs.Tab value="opa" leftSection={<IconShieldCheck size={16} />}>OPA Audit & Decisions</Tabs.Tab>
          <Tabs.Tab value="deployments" leftSection={<IconRocket size={16} />}>Deployments</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Card className="enterprise-card" p="lg">
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
                    ['Created At', new Date(policy.created_at).toLocaleString()],
                    ['Updated At', new Date(policy.updated_at).toLocaleString()],
                  ].map(([label, val]) => (
                    <Table.Tr key={String(label)}>
                      <Table.Td c="dimmed" fw={500} w={200}>{label}</Table.Td>
                      <Table.Td fw={500}>{String(val)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="versions" pt="md">
          {sortedVersions.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No versions recorded for this policy.</Text>
          ) : (
            <Accordion variant="separated" radius="lg" defaultValue={sortedVersions[0]?.version_id ? String(sortedVersions[0].version_id) : undefined}>
              {sortedVersions.map((v: any) => (
                <Accordion.Item key={v.version_id} value={String(v.version_id)} className="enterprise-card">
                  <Accordion.Control>
                    <Group justify="space-between" pr="md">
                      <Group gap="xs">
                        <Badge color={v.is_current ? 'indigo' : 'gray'} variant={v.is_current ? 'filled' : 'light'} size="md">
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
                      <Table size="xs">
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
                          <Table size="xs" highlightOnHover>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Platform ID</Table.Th>
                                <Table.Th>Platform Code</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Celery Task ID</Table.Th>
                                <Table.Th>Deployed Date</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {(v.targets ?? []).map((t: any) => {
                                const taskId = t.celery_task_id
                                return (
                                  <Table.Tr key={t.platform_id}>
                                    <Table.Td><Badge color="gray" variant="outline" size="xs">#{t.platform_id}</Badge></Table.Td>
                                    <Table.Td><Badge color="blue" variant="light" size="xs">{t.platform_code}</Badge></Table.Td>
                                    <Table.Td>
                                      <Badge color={t.deployment_status === 'SUCCESS' ? 'green' : t.deployment_status === 'FAILED' ? 'red' : 'yellow'} size="xs">
                                        {t.deployment_status}
                                      </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                      {taskId ? (
                                        <Code size="xs" color="violet">{taskId}</Code>
                                      ) : (
                                        <Text size="xs" c="dimmed">—</Text>
                                      )}
                                    </Table.Td>
                                    <Table.Td>{t.deployed_at ? new Date(t.deployed_at).toLocaleString() : '—'}</Table.Td>
                                  </Table.Tr>
                                )
                              })}
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
                                <Paper key={r.rule_id || rIdx} p="md" radius="md" withBorder>
                                  <Stack gap="xs">
                                    <Group justify="space-between">
                                      <Group gap="xs">
                                        <Text size="sm" fw={600}>{r.rule_name || `Rule ${rIdx + 1}`}</Text>
                                        <Badge size="xs" color={r.effect === 'ALLOW' ? 'teal' : 'red'}>{r.effect}</Badge>
                                        <Badge size="xs" color="indigo" variant="light">{r.rule_type}</Badge>
                                        <Badge size="xs" color={r.is_active ? 'teal' : 'gray'} variant="outline">
                                          {r.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                      </Group>
                                      <Text size="xs" c="dimmed">Order #{r.rule_order}</Text>
                                    </Group>
                                    {r.rule_description && <Text size="xs" c="dimmed">{r.rule_description}</Text>}
                                    <Divider />
                                    <Group gap="xl" wrap="wrap">
                                      <Box style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600} mb={2}>Subjects</Text>
                                        {(r.subjects ?? []).map((s: any, sIdx: number) => (
                                          <Text key={sIdx} size="xs">
                                            Type: <Text span fw={500}>{s.subject_type}</Text>
                                            {s.role_id && <> | Role: <Text span fw={500} c="indigo">{subjectRole} (ID #{s.role_id})</Text></>}
                                          </Text>
                                        ))}
                                      </Box>
                                      <Box style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600} mb={2}>Action & Data Target</Text>
                                        <Group gap="xs">
                                          <Badge size="xs" color="gray">{r.action_name}</Badge>
                                          {r.target_type && <Badge size="xs" variant="outline">{r.target_type}</Badge>}
                                        </Group>
                                      </Box>
                                    </Group>
                                    {(r.conditions ?? []).length > 0 && (
                                      <Box mt="xs">
                                        <Text size="xs" c="dimmed" fw={600} mb={4}>PBAC / Context Conditions</Text>
                                        <Stack gap={4}>
                                          {(r.conditions ?? []).map((c: any, cIdx: number) => (
                                            <Code key={cIdx} block style={{ fontSize: 11 }}>
                                              {c.expression_type}: {c.condition_expression}
                                            </Code>
                                          ))}
                                        </Stack>
                                      </Box>
                                    )}
                                    {r.transformation && (
                                      <Box mt="xs">
                                        <Text size="xs" c="dimmed" fw={600} mb={4}>Column Masking / Row Filter Transformation</Text>
                                        <Code block color="indigo" style={{ fontSize: 11 }}>
                                          Type: {r.transformation.transform_type} | Expression: {r.transformation.transform_expression || r.transformation.masking_expression || '—'}
                                        </Code>
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
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              <Paper p="md" radius="md" className="enterprise-card">
                <Group justify="space-between" mb="xs">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                    Enforcement Status
                  </Text>
                  <ThemeIcon color="teal" size="sm" radius="xl" variant="light">
                    <IconShieldCheck size={16} />
                  </ThemeIcon>
                </Group>
                <Group gap="xs" mb={4}>
                  <Badge color="teal" size="md" variant="filled">
                    ACTIVE & ENFORCED
                  </Badge>
                  <Badge color="gray" size="sm" variant="outline">
                    v{policy?.current_version_id || 1}.0
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  Synchronized across all registered target data platforms.
                </Text>
              </Paper>
              <Paper p="md" radius="md" className="enterprise-card">
                <Group justify="space-between" mb="xs">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                    Target Data Engines ({targetPlatforms.length})
                  </Text>
                  <ThemeIcon color="indigo" size="sm" radius="xl" variant="light">
                    <IconDatabase size={16} />
                  </ThemeIcon>
                </Group>
                <Group gap="xs" mb={4} wrap="wrap">
                  {targetPlatforms.map((p: any) => {
                    const isGood = p.deployment_status === 'SUCCESS' || p.status === 'SUCCESS' || p.status === 'APPLIED'
                    return (
                      <Badge
                        key={p.platform_code || p.platform_id}
                        color={p.platform_code === 'SNOWFLAKE' ? 'indigo' : 'red'}
                        variant={isGood ? 'light' : 'outline'}
                        size="sm"
                      >
                        {p.platform_code}: {isGood ? 'ENFORCED' : 'PENDING'}
                      </Badge>
                    )
                  })}
                </Group>
                <Text size="xs" c="dimmed">
                  Native microservice connectors pushing compiled SQL DDL.
                </Text>
              </Paper>
              <Paper p="md" radius="md" className="enterprise-card">
                <Group justify="space-between" mb="xs">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                    Celery Async Pipeline
                  </Text>
                  <ThemeIcon color="indigo" size="sm" radius="xl" variant="light">
                    <IconRocket size={16} />
                  </ThemeIcon>
                </Group>
                <Group gap="xs" mb={4}>
                  <Badge color="indigo" size="sm" variant="light">
                    celery_worker
                  </Badge>
                  <Text size="xs" fw={600} c="dimmed">
                    {unifiedDeploymentRows.length} Deployment Runs
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Asynchronous worker task queue via Redis broker & PostgreSQL.
                </Text>
              </Paper>
            </SimpleGrid>
            <Accordion variant="separated" radius="lg" defaultValue="deployment-execution-history">
              <Accordion.Item value="deployment-execution-history" className="enterprise-card">
                <Accordion.Control>
                  <Group justify="space-between" pr="xs">
                    <Group gap="xs">
                      <Text fw={700} size="md">Deployment Execution History</Text>
                      <Badge color="indigo" variant="light" size="xs">
                        {unifiedDeploymentRows.length} Celery Tasks
                      </Badge>
                    </Group>
                    <Group gap="xs">
                      <Badge color="indigo" variant="light" size="xs">
                        {targetPlatforms.length} Target Platforms
                      </Badge>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Group justify="space-between" mb="md">
                    <Text size="xs" c="dimmed">
                      Consolidated audit trail of asynchronous Celery tasks, target platforms, and connector messages.
                    </Text>
                    {unifiedDeploymentRows.length > 0 && (
                      <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        onClick={toggleAll}
                        leftSection={<IconTerminal2 size={14} />}
                      >
                        {allExpanded ? 'Collapse All Logs' : 'Expand All Logs'}
                      </Button>
                    )}
                  </Group>
                  {unifiedDeploymentRows.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="xl">
                      No policy deployments recorded yet. Click "Submit & Deploy" in the page header to deploy policy.
                    </Text>
                  ) : (
                    <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={{ width: '130px' }}>Verdict</Table.Th>
                          <Table.Th style={{ width: '220px' }}>Celery Task ID</Table.Th>
                          <Table.Th style={{ width: '250px' }}>Target Platforms</Table.Th>
                          <Table.Th style={{ width: '90px' }}>Version</Table.Th>
                          <Table.Th style={{ width: '180px' }}>Deployed At</Table.Th>
                          <Table.Th style={{ width: '130px', textAlign: 'right' }}>Connector Logs</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {unifiedDeploymentRows.map((r: any) => {
                          const isExpanded = !!expandedTaskKeys[r.key]
                          return (
                            <Fragment key={r.key}>
                              <Table.Tr
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleExpand(r.key)}
                              >
                                <Table.Td>
                                  <Badge color={r.verdictColor} variant="filled" size="sm">
                                    {r.overallVerdict}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>
                                  {r.celery_task_id ? (
                                    <Group gap={6}>
                                      <Code size="xs" color="indigo">{r.celery_task_id.substring(0, 16)}...</Code>
                                      <CopyButton value={r.celery_task_id}>
                                        {({ copied, copy }) => (
                                          <ActionIcon
                                            size="xs"
                                            variant="subtle"
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              copy()
                                            }}
                                          >
                                            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                                          </ActionIcon>
                                        )}
                                      </CopyButton>
                                    </Group>
                                  ) : (
                                    <Text size="xs" c="dimmed">—</Text>
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  <Group gap={4} wrap="wrap">
                                    {r.platforms.map((p: any) => (
                                      <Badge
                                        key={p.platform_code}
                                        size="xs"
                                        color={p.isSuccess ? 'teal' : 'red'}
                                        variant="light"
                                      >
                                        {p.platform_code}: {p.status}
                                      </Badge>
                                    ))}
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Badge color="gray" size="xs" variant="outline">v{r.version_number}.0</Badge>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed">{r.deployed_at ? new Date(r.deployed_at).toLocaleString() : '—'}</Text>
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>
                                  <Button
                                    variant={isExpanded ? 'light' : 'subtle'}
                                    color={isExpanded ? 'indigo' : 'gray'}
                                    size="xs"
                                    rightSection={isExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                                    leftSection={<IconTerminal2 size={12} />}
                                  >
                                    {isExpanded ? 'Hide' : 'Logs'}
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                              {isExpanded && (
                                <Table.Tr>
                                  <Table.Td colSpan={6} p="md">
                                    <Box p="xs">
                                      <Group justify="space-between" mb="xs">
                                        <Group gap="xs">
                                          <IconTerminal2 size={15} />
                                          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                                            Platform Connector Execution Output
                                          </Text>
                                        </Group>
                                        <Group gap="xs">
                                          <Text size="xs" c="dimmed">
                                            Worker: <Code size="xs">{r.actor_service || 'celery_worker'}</Code>
                                          </Text>
                                          {r.celery_task_id && (
                                            <Text size="xs" c="dimmed">
                                              Task: <Code size="xs" color="indigo">{r.celery_task_id}</Code>
                                            </Text>
                                          )}
                                        </Group>
                                      </Group>
                                      <Table size="xs">
                                        <Table.Thead>
                                          <Table.Tr>
                                            <Table.Th style={{ width: '180px' }}>Data Platform</Table.Th>
                                            <Table.Th style={{ width: '130px' }}>Status</Table.Th>
                                            <Table.Th>Connector Execution Output & Status Message</Table.Th>
                                          </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                          {r.platforms.map((p: any) => (
                                            <Table.Tr key={p.platform_code}>
                                              <Table.Td>
                                                <Badge size="xs" color={p.platform_code === 'SNOWFLAKE' ? 'indigo' : 'red'} variant="filled">
                                                  {p.platform_code}
                                                </Badge>
                                              </Table.Td>
                                              <Table.Td>
                                                <Badge size="xs" color={p.isSuccess ? 'teal' : 'red'} variant="light">
                                                  {p.status}
                                                </Badge>
                                              </Table.Td>
                                              <Table.Td>
                                                <Code
                                                  c={p.isSuccess ? 'teal' : 'red'}
                                                  style={{
                                                    backgroundColor: 'transparent',
                                                    fontSize: '11px',
                                                    fontFamily: 'var(--font-mono)',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    padding: 0,
                                                  }}
                                                >
                                                  {p.message}
                                                </Code>
                                              </Table.Td>
                                            </Table.Tr>
                                          ))}
                                        </Table.Tbody>
                                      </Table>
                                    </Box>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </Table.Tbody>
                    </Table>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            {compiledData?.data && (
              <Card className="enterprise-card" p="lg" radius="lg">
                <Group justify="space-between" mb="sm">
                  <Box>
                    <Text fw={600} size="md">Compiled Platform SQL DDL & Raw Policy Statements</Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      In-Memory Compiled Security DDL for Policy Version v{compiledData.data.raw_payload?.version_number ?? 1}.0
                    </Text>
                  </Box>
                  <Badge color="indigo" variant="light" size="sm">
                    Version v{compiledData.data.raw_payload?.version_number ?? 1}.0
                  </Badge>
                </Group>
                <Tabs defaultValue="snowflake" color="indigo">
                  <Tabs.List mb="sm">
                    <Tabs.Tab value="snowflake" leftSection={<Code color="indigo" size="xs">SF</Code>}>
                      Snowflake SQL
                    </Tabs.Tab>
                    <Tabs.Tab value="redshift" leftSection={<Code color="red" size="xs">RS</Code>}>
                      Redshift SQL
                    </Tabs.Tab>
                    <Tabs.Tab value="opa" leftSection={<Code color="teal" size="xs">OPA</Code>}>
                      OPA Rego Policy
                    </Tabs.Tab>
                    <Tabs.Tab value="raw_json" leftSection={<Code color="yellow" size="xs">JSON</Code>}>
                      Raw Policy JSON
                    </Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="snowflake">
                    <Box style={{ position: 'relative' }}>
                      <Code block className="code-block" style={{ maxHeight: 380, overflow: 'auto' }}>
                        {compiledData.data.snowflake_sql}
                      </Code>
                    </Box>
                  </Tabs.Panel>
                  <Tabs.Panel value="redshift">
                    <Box style={{ position: 'relative' }}>
                      <Code block className="code-block" style={{ maxHeight: 380, overflow: 'auto' }}>
                        {compiledData.data.redshift_sql}
                      </Code>
                    </Box>
                  </Tabs.Panel>
                  <Tabs.Panel value="opa">
                    <Box style={{ position: 'relative' }}>
                      <Code block className="code-block" style={{ maxHeight: 380, overflow: 'auto' }}>
                        {compiledData.data.opa_rego || '# No OPA Rego generated for this version'}
                      </Code>
                    </Box>
                  </Tabs.Panel>
                  <Tabs.Panel value="raw_json">
                    <Box style={{ position: 'relative' }}>
                      <Code block className="code-block" style={{ maxHeight: 380, overflow: 'auto' }}>
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

              {/* Logged OPA Audit Events (Zero Celery logs, pure OPA validation decisions) */}
              <Text fw={600} size="sm" mb="xs" c="dimmed">Logged OPA Decisions in DB ({opaAuditLogs.length} events recorded)</Text>
              {opaAuditLogs.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="xl">No OPA audit decisions logged yet. Click "Run OPA Evaluation" above to evaluate policy against OPA.</Text>
              ) : (
                <Table highlightOnHover size="xs" style={{ borderRadius: 8 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>OPA Verdict</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Timestamp</Table.Th>
                      <Table.Th>OPA Evaluation Details & Violations</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {opaAuditLogs.map((e: any) => {
                      const isSuccess = e.outcome === 'SUCCESS'
                      return (
                        <Table.Tr key={e.event_id}>
                          <Table.Td>
                            <Badge color={isSuccess ? 'green' : 'red'} size="xs">
                              {isSuccess ? 'APPROVED / ALLOW' : 'REJECTED / DENY'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" variant="outline" color="violet">
                              {e.event_type}
                            </Badge>
                          </Table.Td>
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
                      )
                    })}
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
