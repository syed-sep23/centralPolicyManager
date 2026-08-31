import { useState } from 'react'
import {
  Box, Paper, TextInput, PasswordInput, Button, Title, Text,
  Stack, Group, Alert, Anchor,
} from '@mantine/core'
import { IconBracketsContain, IconAlertCircle } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/client'
import { useAuthStore } from '../../store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleLogin = async () => {
    if (!username || !password) return
    setLoading(true); setError('')
    try {
      const res = await authApi.login(username, password)
      const { access_token } = res.data
      const me = await authApi.me()
      setAuth(access_token, { user_id: me.data.user_id, username: me.data.username, roles: [] })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at top, rgba(109,40,217,0.2) 0%, transparent 60%), #0d0d0d',
      }}
    >
      <Stack align="center" gap="xl" w="100%" maw={420} px="md">
        {/* Logo */}
        <Stack align="center" gap="xs">
          <Box
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
            }}
          >
            <IconBracketsContain size={28} color="white" />
          </Box>
          <Title order={2} className="gradient-text">Central Policy Management</Title>
          <Text c="dimmed" size="sm" ta="center">
            Open-source Data Access Control & Policy Governance (CPM)
          </Text>
        </Stack>

        {/* Login card */}
        <Paper
          p="xl"
          radius="lg"
          w="100%"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Stack gap="md">
            <Title order={3} size="h4">Sign In</Title>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" radius="md">
                {error}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              id="login-username"
            />
            <PasswordInput
              label="Password"
              placeholder="admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              id="login-password"
            />

            <Button
              fullWidth
              size="md"
              loading={loading}
              onClick={handleLogin}
              id="login-submit"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                border: 'none',
              }}
            >
              Sign In
            </Button>

            <Text size="xs" c="dimmed" ta="center">
              Default Credentials: <b>admin</b> / <b>admin</b>
            </Text>
          </Stack>
        </Paper>

        <Text size="xs" c="dimmed">
          Open-source · MIT License · No proprietary dependencies
        </Text>
      </Stack>
    </Box>
  )
}
