// frontend-service/src/theme.ts
import {
    createTheme,
    Button,
    Card,
    Paper,
    Table,
    Badge,
    NavLink,
    Code,
    ActionIcon,
    Modal,
    TextInput,
    Select,
    CSSVariablesResolver,
} from '@mantine/core'

export const theme = createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 7 },
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMonospace: '"JetBrains Mono", "Fira Code", monospace',
    defaultRadius: 'sm',

    // Custom 10-shade palettes for enterprise security branding
    colors: {
        brand: [
            '#EEF2FF', '#E0E7FF', '#C7D2FE', '#A5B4FC',
            '#818CF8', '#6366F1', '#4F46E5', '#4338CA',
            '#3730A3', '#312E81',
        ],
        // Slate neutral palette for background/surfaces
        dark: [
            '#F8FAFC', // 0: Highest contrast text
            '#94A3B8', // 1: Dimmed text
            '#64748B', // 2: Muted text / icons
            '#334155', // 3: Active borders / dividers
            '#1E293B', // 4: Card borders / subtle outlines
            '#172033', // 5: Surface card elevated
            '#0F172A', // 6: Surface card base
            '#0B0F19', // 7: App Shell background
            '#070A10', // 8: Code blocks / deep inset
            '#030508', // 9: Absolute black
        ],
    },

    // Component-level overrides driven strictly by theme tokens
    components: {
        Button: Button.extend({
            defaultProps: {
                size: 'xs',
                radius: 'sm',
            },
            styles: {
                root: {
                    fontWeight: 600,
                    transition: 'all 150ms ease',
                },
            },
        }),

        Card: Card.extend({
            defaultProps: {
                padding: 'md',
                radius: 'md',
                withBorder: true,
            },
        }),

        Paper: Paper.extend({
            defaultProps: {
                radius: 'md',
                withBorder: true,
            },
        }),

        Table: Table.extend({
            defaultProps: {
                highlightOnHover: true,
                withTableBorder: false,
                verticalSpacing: 'xs',
                horizontalSpacing: 'sm',
            },
            styles: (theme) => ({
                thead: {
                    borderBottom: `1px solid var(--mantine-color-default-border)`,
                },
                th: {
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    color: 'var(--mantine-color-dimmed)',
                    backgroundColor: 'transparent',
                },
                tr: {
                    transition: 'background-color 120ms ease',
                },
            }),
        }),

        Badge: Badge.extend({
            defaultProps: {
                radius: 'xs',
                variant: 'light',
                size: 'sm',
            },
            styles: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                },
            },
        }),

        NavLink: NavLink.extend({
            defaultProps: {
                variant: 'light',
            },
            styles: (theme) => ({
                root: {
                    borderRadius: theme.radius.sm,
                    padding: '6px 10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'background-color 150ms ease, color 150ms ease',
                    '&[data-active]': {
                        fontWeight: 600,
                    },
                },
            }),
        }),

        Code: Code.extend({
            styles: (theme) => ({
                root: {
                    fontFamily: theme.fontFamilyMonospace,
                    fontSize: '12px',
                    padding: '2px 6px',
                    borderRadius: theme.radius.xs,
                    border: '1px solid var(--mantine-color-default-border)',
                },
            }),
        }),

        ActionIcon: ActionIcon.extend({
            defaultProps: {
                variant: 'subtle',
                size: 'sm',
                radius: 'sm',
            },
        }),

        Modal: Modal.extend({
            defaultProps: {
                radius: 'md',
                overlayProps: {
                    blur: 4,
                    opacity: 0.55,
                },
            },
        }),

        TextInput: TextInput.extend({
            defaultProps: {
                size: 'xs',
                radius: 'sm',
            },
        }),

        Select: Select.extend({
            defaultProps: {
                size: 'xs',
                radius: 'sm',
            },
        }),
    },
})

// CSS Variables Resolver: Centralized design tokens without manual CSS files
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    variables: {
        '--ces-header-height': '52px',
        '--ces-sidebar-width': '250px',
        '--ces-transition-speed': '150ms',
    },
    light: {
        '--ces-surface-code': theme.colors.gray[1],
        '--ces-border-glow': 'rgba(99, 102, 241, 0.12)',
    },
    dark: {
        '--ces-surface-code': theme.colors.dark[8],
        '--ces-border-glow': 'rgba(99, 102, 241, 0.25)',
    },
})
