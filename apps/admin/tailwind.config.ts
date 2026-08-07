import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const config: Config = {
  // KEEP. An earlier pass removed this on the grounds that "apps/admin has zero
  // `dark:` classes" — true of apps/admin/src, and wrong overall: `content`
  // below also globs packages/ui/src, which has 97 of them, and admin renders
  // both `Card` and `Button` from there.
  //
  // Tailwind v3 defaults to `darkMode: 'media'`, so removing this recompiled
  // those 97 rules from `:is(.dark *)` — which never matched, because admin
  // sets no `.dark` class — into `@media (prefers-color-scheme: dark)`, which
  // matches for any operator whose OS is in dark mode. Verified in the built
  // CSS: dark card/border rules moved into a live media block. `'class'` is
  // what actually neutralises them.
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    /**
     * CLOSED palette — `theme.colors`, not `theme.extend.colors`.
     *
     * Under `extend`, every ramp Tailwind ships resolved: `bg-teal-500`,
     * `text-indigo-700` and eighteen others silently worked, so the console's
     * colour surface was the whole stock palette rather than anything anyone
     * had decided on. `guard:design-tokens` counts raw-palette usage but does
     * not stop a new ramp appearing.
     *
     * Listing them here makes the surface explicit and versioned: a class
     * outside this set now emits NO CSS and fails visibly in review instead of
     * quietly widening the palette.
     *
     * The stock ramps below are KEPT, not endorsed. Draining them to semantic
     * tokens is the design-system migration program (see .claude/rules/design.md
     * and scripts/design-token-baseline.json), which is explicitly out of scope
     * for hardening. What changes here is only that the set is now finite.
     *
     * Scope note: `content` includes `packages/ui/src`, so this must cover the
     * ramps THOSE components use too — `sky` and `pink` are here for that
     * reason alone and appear nowhere in apps/admin/src.
     */
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#FFFFFF',
      black: '#000000',

      // "Florida Modern" brand ramp — mirrors packages/tokens coral. Admin
      // uses coral-* for brand/interactive/CTA/focus; the `blue` ramp below is
      // retained for informational status badges (Trial, Cancelled, etc.).
      coral: {
        50: '#FCF1ED',
        100: '#F7DCD2',
        200: '#EDB9A6',
        300: '#E19478',
        400: '#D4744F',
        500: '#CB6047',
        600: '#C2533A',
        700: '#A8412C',
        800: '#87331F',
        900: '#68291B',
      },
      blue: {
        50: '#EFF6FF',
        100: '#DBEAFE',
        200: '#BFDBFE',
        300: '#93C5FD',
        400: '#60A5FA',
        500: '#3B82F6',
        600: '#2563EB',
        700: '#1D4ED8',
        800: '#1E40AF',
        900: '#1E3A8A',
        950: '#172554',
      },
      gray: {
        0: '#FFFFFF',
        25: '#FCFCFD',
        50: '#F9FAFB',
        100: '#F3F4F6',
        200: '#E5E7EB',
        300: '#D1D5DB',
        400: '#9CA3AF',
        500: '#6B7280',
        600: '#4B5563',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
        950: '#0D1117',
      },

      // Stock ramps in active use, pinned to Tailwind's own values.
      red: colors.red,
      orange: colors.orange,
      amber: colors.amber,
      yellow: colors.yellow,
      green: colors.green,
      emerald: colors.emerald,
      violet: colors.violet,
      purple: colors.purple,
      rose: colors.rose,
      // packages/ui only.
      sky: colors.sky,
      pink: colors.pink,

      // ─────────────────────────────────────────────────────────────────────
      // Semantic token families (P3-6, admin semantic-token migration).
      //
      // Mirrors apps/web/tailwind.config.ts. `src/styles/globals.css` already
      // imports packages/ui/src/styles/tokens.css, so every var() below already
      // resolves at runtime — admin simply never mapped them into Tailwind
      // class names. That is the whole gap this bridge closes.
      //
      // These live INSIDE the closed `theme.colors` object, not `extend`, so
      // the palette stays finite (the point of the hardening Phase 4 lockdown).
      //
      // coral/blue/gray stay alongside for the duration of the drain: the
      // namespaces are disjoint (`gray-*` vs `content-*`), so raw and semantic
      // coexist cleanly. Removing them before the files are migrated would
      // blank out ~1,088 class usages at once. They come out only once the
      // drain is complete.
      //
      // NOTE: these are bare `var(--x)` with no `<alpha-value>` channel, so
      // slash-opacity (`bg-interactive/10`) compiles to ZERO CSS and renders as
      // nothing. `guard:design-tokens`'s `slash-opacity-semantic` rule becomes
      // applicable to admin the moment this block exists — reach for a solid
      // `-subtle`/`-bg`/`-hover` token instead.
      // ─────────────────────────────────────────────────────────────────────

      // Text — usage: text-content, text-content-secondary, …
      content: {
        DEFAULT: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        disabled: 'var(--text-disabled)',
        placeholder: 'var(--text-placeholder)',
        inverse: 'var(--text-inverse)',
        brand: 'var(--text-brand)',
        link: 'var(--text-link)',
        'link-hover': 'var(--text-link-hover)',
      },

      // Backgrounds — usage: bg-surface-page, bg-surface-card, …
      surface: {
        page: 'var(--surface-page)',
        card: 'var(--surface-card)',
        subtle: 'var(--surface-subtle)',
        muted: 'var(--surface-muted)',
        elevated: 'var(--surface-elevated)',
        sunken: 'var(--surface-sunken)',
        hover: 'var(--surface-hover)',
        inverse: 'var(--surface-inverse)',
        'inverse-subtle': 'var(--surface-inverse-subtle)',
      },

      // Borders — usage: border-edge, border-edge-strong, …
      edge: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        muted: 'var(--border-muted)',
        focus: 'var(--border-focus)',
        error: 'var(--border-error)',
      },

      // Interactive — usage: bg-interactive, hover:bg-interactive-hover, …
      interactive: {
        DEFAULT: 'var(--interactive-primary)',
        hover: 'var(--interactive-primary-hover)',
        active: 'var(--interactive-primary-active)',
        disabled: 'var(--interactive-disabled)',
        subtle: 'var(--interactive-subtle)',
        'subtle-hover': 'var(--interactive-subtle-hover)',
        muted: 'var(--interactive-muted)',
      },

      // Status — usage: text-status-success, bg-status-danger-subtle, …
      status: {
        success: 'var(--status-success)',
        'success-bg': 'var(--status-success-bg)',
        'success-border': 'var(--status-success-border)',
        'success-subtle': 'var(--status-success-subtle)',

        warning: 'var(--status-warning)',
        'warning-bg': 'var(--status-warning-bg)',
        'warning-border': 'var(--status-warning-border)',
        'warning-subtle': 'var(--status-warning-subtle)',

        danger: 'var(--status-danger)',
        'danger-bg': 'var(--status-danger-bg)',
        'danger-border': 'var(--status-danger-border)',
        'danger-subtle': 'var(--status-danger-subtle)',

        info: 'var(--status-info)',
        'info-bg': 'var(--status-info-bg)',
        'info-border': 'var(--status-info-border)',
        'info-subtle': 'var(--status-info-subtle)',

        neutral: 'var(--status-neutral)',
        'neutral-bg': 'var(--status-neutral-bg)',
        'neutral-border': 'var(--status-neutral-border)',
        'neutral-subtle': 'var(--status-neutral-subtle)',

        brand: 'var(--status-brand)',
        'brand-bg': 'var(--status-brand-bg)',
        'brand-border': 'var(--status-brand-border)',
        'brand-subtle': 'var(--status-brand-subtle)',

        premium: 'var(--status-premium)',
        'premium-bg': 'var(--status-premium-bg)',
        'premium-border': 'var(--status-premium-border)',
        'premium-subtle': 'var(--status-premium-subtle)',
      },

      // Navigation
      nav: {
        'text-active': 'var(--nav-text-active)',
        'text-inactive': 'var(--nav-text-inactive)',
        'text-muted': 'var(--nav-text-muted)',
        'bg-active': 'var(--nav-bg-active)',
        'bg-hover': 'var(--nav-bg-hover)',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: '0.6875rem',
        sm: '0.8125rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '20': '80px',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      // Focus-ring utilities (`ring-focus`, `ring-error`), matching web.
      // Drains need these — never suppress :focus-visible to avoid a raw ring color.
      ringColor: {
        focus: 'var(--border-focus)',
        error: 'var(--border-error)',
      },

      boxShadow: {
        e0: 'none',
        e1: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        e2: '0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)',
        e3: '0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
