import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, lighten, virtualColor } from '@mantine/core'
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

// ─── Mantine Starry Night Theme (from mantine-tweaker) ───────────────────────
const theme = createTheme({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  defaultRadius: '0.5rem',
  white: '#f5f7fa',
  black: '#1a2238',
  primaryColor: 'primary',
  primaryShade: 5,
  defaultGradient: {
    from: '#6ea3c1',
    to: '#bccdf0',
    deg: 113,
  },
  colors: {
    primary: virtualColor({
      name: 'primary',
      dark: 'primarydark',
      light: 'primarylight',
    }),
    // dark -mode
    dark: [
      '#e6eaf3',
      '#181a24',
      'rgba(162, 172, 189, 1)',
      '#7a88a1',
      '#2d2e3e',
      '#ffe066',
      '#23243a',
      '#181a24',
      'rgba(19, 21, 29, 1)',
      'blue',
    ],

    // light -mode
    gray: [
      '#f7c873',
      'rgba(249, 217, 157, 1)',
      '#e5e5df',
      '#6ea3c1',
      '#b0b8c1',
      '#3a5ba0',
      'rgba(117, 140, 189, 1)',
      '#fffbe6',
      'red',
      '#1a2238',
    ],
    primarylight: [
      'green',
      'green',
      'green',
      'green',
      'green',
      '#3a5ba0',
      'rgba(88, 116, 174, 1)',
      'green',
      'green',
      'green',
    ],
    primarydark: [
      '#e6eaf3',
      '#3a5ba0',
      'yellow',
      '#3a5ba0',
      '#3a5ba0',
      '#3a5ba0',
      'rgba(49, 77, 136, 1)',
      'yellow',
      'yellow',
      'yellow',
    ],
  },
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
