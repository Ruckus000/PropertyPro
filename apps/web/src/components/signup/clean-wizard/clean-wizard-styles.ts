import type { CSSProperties } from 'react';

/**
 * Transcribed from `df32307b-clean-wizard.js`.
 * `CLEAN_ACCENT` and all `cleanStyles` numeric/string tokens are verbatim from the reference.
 * `next/font` variables are prepended to `fontFamily` entries where the reference named Geist / JetBrains Mono
 * so the packaged fonts apply (see `fonts.ts` + `.clean-signup-root`).
 */
export const CLEAN_ACCENT = {
  '--accent': 'oklch(0.68 0.12 275)', // button + progress fill
  '--accent-ink': 'oklch(0.52 0.14 275)', // borders on selected cards, links
  '--accent-wash': 'oklch(0.965 0.025 275)', // selected card fill
} as const;

export type StepChipState = 'done' | 'current' | 'locked';

/** Explicit type avoids TS2742 (non-portable inferred `csstype` reference) with declaration emit. */
export type CleanStyleSheet = {
  shell: CSSProperties;
  topbar: CSSProperties;
  brand: CSSProperties;
  brandDot: CSSProperties;
  help: CSSProperties;
  helpLink: CSSProperties;
  progressWrap: CSSProperties;
  progressBar: CSSProperties;
  progressFill: CSSProperties;
  stepperRow: CSSProperties;
  stepChip: (state: StepChipState) => CSSProperties;
  stepNum: (state: StepChipState) => CSSProperties;
  stepTitle: (state: StepChipState) => CSSProperties;
  body: CSSProperties;
  eyebrow: CSSProperties;
  h1: CSSProperties;
  sub: CSSProperties;
  formSection: (gap: number) => CSSProperties;
  fieldFull: CSSProperties;
  label: CSSProperties;
  input: CSSProperties;
  hint: CSSProperties;
  footer: CSSProperties;
  backBtn: CSSProperties;
  nextBtn: CSSProperties;
  typeGrid: CSSProperties;
  typeCard: (selected: boolean) => CSSProperties;
  typeLabel: CSSProperties;
  typeStatute: CSSProperties;
  typeDesc: CSSProperties;
  planRow: CSSProperties;
  planCard: (selected: boolean) => CSSProperties;
  planHead: CSSProperties;
  planName: CSSProperties;
  planPrice: CSSProperties;
  planPriceUnit: CSSProperties;
  planBlurb: CSSProperties;
  planBullets: CSSProperties;
  planBullet: CSSProperties;
  subdomainWrap: CSSProperties;
  subInput: CSSProperties;
  subSuffix: CSSProperties;
  terms: CSSProperties;
  checkbox: CSSProperties;
  helperPanel: CSSProperties;
  helperEyebrow: CSSProperties;
  helperH: CSSProperties;
  helperPara: CSSProperties;
  divider: CSSProperties;
};

export const cleanStyles: CleanStyleSheet = {
  shell: {
    width: '100%',
    height: '100%',
    background: 'oklch(0.985 0.004 95)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      'var(--font-geist-sans), "Geist", ui-sans-serif, system-ui, sans-serif',
    color: 'var(--ink)',
    ...(CLEAN_ACCENT as unknown as CSSProperties),
  },
  topbar: {
    padding: '22px 40px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' },
  brandDot: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: 'linear-gradient(135deg, oklch(0.68 0.12 275), oklch(0.52 0.14 275))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
  },
  help: { fontSize: 13, color: 'var(--ink-faint)' },
  helpLink: {
    color: 'var(--ink-soft)',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    textDecorationThickness: '0.5px',
  },

  progressWrap: { padding: '26px 40px 0' },
  progressBar: { height: 3, background: 'var(--line)', borderRadius: 2, position: 'relative', overflow: 'hidden' },
  progressFill: {
    position: 'absolute',
    inset: 0,
    right: 'auto',
    background: 'var(--accent)',
    transition: 'width 400ms cubic-bezier(0.2,0.8,0.2,1)',
  },
  stepperRow: { display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8 },
  stepChip: (state: StepChipState): CSSProperties => ({
    flex: 1,
    textAlign: 'left',
    cursor: state === 'locked' ? 'default' : 'pointer',
    padding: '2px 0',
    opacity: state === 'locked' ? 0.5 : 1,
  }),
  stepNum: (state: StepChipState): CSSProperties => ({
    fontSize: 11,
    fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
    letterSpacing: '0.04em',
    color: state === 'current' ? 'var(--accent-ink)' : 'var(--ink-faint)',
    fontWeight: state === 'current' ? 600 : 400,
  }),
  stepTitle: (state: StepChipState): CSSProperties => ({
    fontSize: 13,
    marginTop: 2,
    fontWeight: 500,
    color:
      state === 'current' ? 'var(--ink)' : state === 'done' ? 'var(--ink-soft)' : 'var(--ink-faint)',
  }),

  body: { flex: 1, padding: '18px 40px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
  },
  h1: { fontSize: 20, fontWeight: 600, margin: '2px 0 0', letterSpacing: '-0.02em' },
  sub: { fontSize: 13, color: 'var(--ink-soft)', margin: 0 },

  formSection: (gap: number): CSSProperties => ({
    marginTop: 14,
    display: 'grid',
    gap,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  }),
  fieldFull: { gridColumn: '1 / -1' },
  label: { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 6, letterSpacing: '-0.005em' },
  input: {
    width: '100%',
    height: 42,
    padding: '0 14px',
    border: '1px solid var(--line)',
    borderRadius: 10,
    background: 'white',
    fontSize: 14,
    color: 'var(--ink)',
    outline: 'none',
    transition: 'border-color .15s, box-shadow .15s',
  },
  hint: { fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 },

  footer: {
    flexShrink: 0,
    padding: '14px 40px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--line-soft)',
    background: 'oklch(0.99 0.003 95)',
  },
  backBtn: {
    height: 40,
    padding: '0 16px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'white',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink-soft)',
    cursor: 'pointer',
  },
  nextBtn: {
    height: 40,
    padding: '0 22px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--ink)',
    color: 'white',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '-0.005em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },

  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, gridColumn: '1 / -1' },
  typeCard: (selected: boolean): CSSProperties => ({
    padding: '16px 16px 18px',
    textAlign: 'left',
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
    borderRadius: 12,
    background: selected ? 'var(--accent-wash)' : 'white',
    cursor: 'pointer',
    transition: 'all .12s',
    boxShadow: selected ? '0 0 0 3px oklch(0.68 0.12 275 / 0.18)' : 'none',
  }),
  typeLabel: { fontSize: 14, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 },
  typeStatute: { fontSize: 11, fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace', color: 'var(--ink-faint)', fontWeight: 400 },
  typeDesc: { fontSize: 12, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 },

  planRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, gridColumn: '1 / -1' },
  planCard: (selected: boolean): CSSProperties => ({
    padding: '20px',
    position: 'relative',
    cursor: 'pointer',
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
    borderRadius: 14,
    background: 'white',
    transition: 'all .12s',
    boxShadow: selected ? '0 0 0 3px oklch(0.68 0.12 275 / 0.18)' : '0 1px 2px rgba(0,0,0,0.02)',
  }),
  planHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  planName: { fontSize: 16, fontWeight: 600, margin: 0 },
  planPrice: { fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' },
  planPriceUnit: { fontSize: 12, color: 'var(--ink-faint)', fontWeight: 400 },
  planBlurb: { fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 14px', lineHeight: 1.5 },
  planBullets: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 },
  planBullet: { fontSize: 12.5, color: 'var(--ink-soft)', paddingLeft: 18, position: 'relative' },

  subdomainWrap: { display: 'flex', alignItems: 'stretch', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white' },
  subInput: { flex: 1, border: 'none', height: 42, padding: '0 14px', fontSize: 14, outline: 'none', background: 'transparent' },
  subSuffix: {
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    background: 'oklch(0.96 0.005 95)',
    borderLeft: '1px solid var(--line)',
    fontSize: 13,
    color: 'var(--ink-soft)',
    fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
  },

  terms: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 20, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 },
  checkbox: { width: 16, height: 16, marginTop: 2, accentColor: 'oklch(0.68 0.12 275)' },

  helperPanel: {
    borderLeft: '1px solid var(--line-soft)',
    padding: '36px 32px',
    background: 'oklch(0.98 0.004 95)',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
    fontSize: 13,
    color: 'var(--ink-soft)',
    lineHeight: 1.55,
  },
  helperEyebrow: {
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
  },
  helperH: { fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '2px 0 0' },
  helperPara: { margin: 0 },
  divider: { height: 1, background: 'var(--line-soft)', border: 'none' },
};
