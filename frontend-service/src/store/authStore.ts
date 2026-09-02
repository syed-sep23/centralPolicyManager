import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  user: { user_id: number; username: string; roles: string[] } | null
  setAuth: (token: string, user: AuthState['user']) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: 'no-auth-token',
      user: {
        user_id: 1,
        username: 'admin',
        roles: ['ADMIN', 'SUPER_ADMIN', 'POLICY_AUTHOR', 'DATA_GOVERNOR', 'DATA_ENGINEER', 'ANALYST'],
      },
      setAuth: (token, user) => set({ token, user }),
      logout: () =>
        set({
          token: 'no-auth-token',
          user: {
            user_id: 1,
            username: 'admin',
            roles: ['ADMIN', 'SUPER_ADMIN'],
          },
        }),
    }),
    { name: 'ces-auth' }
  )
)
