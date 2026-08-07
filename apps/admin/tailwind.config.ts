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
