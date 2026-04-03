import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "SF Mono", "ui-monospace", "monospace"],
        heading: ["var(--theme-font-heading, Inter)", "var(--font-sans)", "sans-serif"],
        body: ["var(--theme-font-body, Inter)", "var(--font-sans)", "sans-serif"],
      },
      fontSize: {
        xs: "var(--font-size-xs, 0.6875rem)",
        sm: "var(--font-size-sm, 0.8125rem)",
        base: "var(--font-size-base, 1rem)",
        lg: "var(--font-size-lg, 1.125rem)",
        xl: "var(--font-size-xl, 1.25rem)",
        "2xl": "var(--font-size-2xl, 1.5rem)",
        "3xl": "var(--font-size-3xl, 1.875rem)",
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "7": "28px",
        "8": "32px",
        "9": "36px",
        "10": "40px",
        "11": "44px",
        "12": "48px",
        "14": "56px",
        "16": "64px",
        "20": "80px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        e0: "none",
        e1: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        e2: "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
        e3: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
      },
      colors: {
        // ── Legacy primitives (kept during migration, remove after) ──
        primary: {
          DEFAULT: 'var(--interactive-primary)',
          hover: 'var(--interactive-primary-hover)',
          light: 'var(--brand-accent)',
        },
        secondary: {
          DEFAULT: 'var(--text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--brand-accent)',
        },
        blue: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },
        gray: {
          0: "#FFFFFF",
          25: "#FCFCFD",
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
          950: "#0D1117",
        },

        // ── Semantic: Content (text colors) ──
        // Usage: text-content, text-content-secondary, text-content-tertiary, etc.
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

        // ── Semantic: Surfaces (background colors) ──
        // Usage: bg-surface-page, bg-surface-card, bg-surface-muted, etc.
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

        // ── Semantic: Edges (border colors) ──
        // Usage: border-edge, border-edge-subtle, border-edge-strong, etc.
        edge: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          muted: 'var(--border-muted)',
          focus: 'var(--border-focus)',
          error: 'var(--border-error)',
        },

        // ── Semantic: Interactive ──
        // Usage: bg-interactive, hover:bg-interactive-hover, etc.
        interactive: {
          DEFAULT: 'var(--interactive-primary)',
          hover: 'var(--interactive-primary-hover)',
          active: 'var(--interactive-primary-active)',
          disabled: 'var(--interactive-disabled)',
          subtle: 'var(--interactive-subtle)',
          'subtle-hover': 'var(--interactive-subtle-hover)',
          muted: 'var(--interactive-muted)',
        },

        // ── Semantic: Status ──
        // Usage: text-status-success, bg-status-success-bg, border-status-success-border
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
        },

        // ── Semantic: Navigation ──
        nav: {
          'text-active': 'var(--nav-text-active)',
          'text-inactive': 'var(--nav-text-inactive)',
          'text-muted': 'var(--nav-text-muted)',
          'bg-active': 'var(--nav-bg-active)',
          'bg-hover': 'var(--nav-bg-hover)',
        },
      },

      // ── Ring colors (focus ring utilities) ──
      ringColor: {
        focus: 'var(--border-focus)',
        error: 'var(--border-error)',
      },

      // ── Motion: transition durations ──
      transitionDuration: {
        instant: 'var(--motion-duration-instant)',
        micro: 'var(--motion-duration-micro)',
        quick: 'var(--motion-duration-quick)',
        standard: 'var(--motion-duration-standard)',
        slow: 'var(--motion-duration-slow)',
        expressive: 'var(--motion-duration-expressive)',
      },

      // ── Motion: easing functions ──
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        enter: 'var(--ease-enter)',
        exit: 'var(--ease-exit)',
        bounce: 'var(--ease-bounce)',
      },

      keyframes: {
        draw: {
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        draw: 'draw 600ms ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
