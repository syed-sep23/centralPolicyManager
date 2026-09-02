import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/charts/styles.css'
import './styles/global.css'

// ─── Mantine Minimalist Theme ────────────────────────────────────────────────
const theme = createTheme({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  primaryColor: 'indigo',
  defaultRadius: 'sm',
  cursorType: 'pointer',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '600',
  },
  components: {
    Button: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
        fw: 500,
      },
    },
    Card: {
      defaultProps: {
        withBorder: true,
        shadow: 'none',
        radius: 'sm',
        padding: 'md',
      },
    },
    Paper: {
      defaultProps: {
        withBorder: true,
        shadow: 'none',
        radius: 'sm',
      },
    },
    Table: {
      defaultProps: {
        highlightOnHover: true,
        withTableBorder: true,
        withColumnBorders: false,
        verticalSpacing: 'sm',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'xs',
        variant: 'light',
        size: 'sm',
        fw: 500,
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
      },
    },
    Select: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
        comboboxProps: { shadow: 'md', transitionProps: { transition: 'pop', duration: 150 } },
      },
    },
    MultiSelect: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
        comboboxProps: { shadow: 'md', transitionProps: { transition: 'pop', duration: 150 } },
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'sm',
        shadow: 'md',
        overlayProps: {
          backgroundOpacity: 0.4,
          blur: 3,
        },
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: 'sm',
        variant: 'subtle',
      },
    },
    ThemeIcon: {
      defaultProps: {
        radius: 'sm',
        variant: 'light',
      },
    },
    SegmentedControl: {
      defaultProps: {
        radius: 'sm',
        size: 'xs',
      },
    },
    Divider: {
      defaultProps: {
        opacity: 0.6,
      },
    },
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Notifications position="top-right" />
          <ModalsProvider>
            <App />
          </ModalsProvider>
        </MantineProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)
