// Variation A — Clean SaaS wizard.
// Top progress bar with stepper, card-body, two-column form layout, primary button.
// Conventional pattern that matches the existing PropertyPro brand tone.

// Override --accent locally for this variation so we match the periwinkle
// blue from the source screenshot (approx #8b93e8 for buttons, a slightly
// deeper tone for selected borders, soft wash for selected-card fills).
const CLEAN_ACCENT = {
  '--accent': 'oklch(0.68 0.12 275)',       // button + progress fill
  '--accent-ink': 'oklch(0.52 0.14 275)',   // borders on selected cards, links
  '--accent-wash': 'oklch(0.965 0.025 275)', // selected card fill
};

const cleanStyles = {
  shell: {
    width: '100%', height: '100%',
    background: 'oklch(0.985 0.004 95)',
    display: 'flex', flexDirection: 'column',
    fontFamily: '"Geist", ui-sans-serif, system-ui, sans-serif',
    color: 'var(--ink)',
    ...CLEAN_ACCENT,
  },
  topbar: {
    padding: '22px 40px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' },
  brandDot: { width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, oklch(0.68 0.12 275), oklch(0.52 0.14 275))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)' },
  help: { fontSize: 13, color: 'var(--ink-faint)' },
  helpLink: { color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationThickness: '0.5px' },

  progressWrap: { padding: '26px 40px 0' },
  progressBar: { height: 3, background: 'var(--line)', borderRadius: 2, position: 'relative', overflow: 'hidden' },
  progressFill: { position: 'absolute', inset: 0, right: 'auto', background: 'var(--accent)', transition: 'width 400ms cubic-bezier(0.2,0.8,0.2,1)' },
  stepperRow: { display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8 },
  stepChip: (state) => ({
    flex: 1, textAlign: 'left', cursor: state === 'locked' ? 'default' : 'pointer',
    padding: '2px 0', opacity: state === 'locked' ? 0.5 : 1,
  }),
  stepNum: (state) => ({
    fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.04em',
    color: state === 'current' ? 'var(--accent-ink)' : 'var(--ink-faint)',
    fontWeight: state === 'current' ? 600 : 400,
  }),
  stepTitle: (state) => ({
    fontSize: 13, marginTop: 2, fontWeight: 500,
    color: state === 'current' ? 'var(--ink)' : state === 'done' ? 'var(--ink-soft)' : 'var(--ink-faint)',
  }),

  body: { flex: 1, padding: '18px 40px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  eyebrow: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: '"JetBrains Mono", monospace' },
  h1: { fontSize: 20, fontWeight: 600, margin: '2px 0 0', letterSpacing: '-0.02em' },
  sub: { fontSize: 13, color: 'var(--ink-soft)', margin: 0 },

  formSection: (gap) => ({ marginTop: 14, display: 'grid', gap, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }),
  fieldFull: { gridColumn: '1 / -1' },
  label: { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 6, letterSpacing: '-0.005em' },
  input: {
    width: '100%', height: 42, padding: '0 14px',
    border: '1px solid var(--line)', borderRadius: 10,
    background: 'white', fontSize: 14, color: 'var(--ink)',
    outline: 'none', transition: 'border-color .15s, box-shadow .15s',
  },
  hint: { fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 },

  footer: {
    flexShrink: 0, padding: '14px 40px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderTop: '1px solid var(--line-soft)',
    background: 'oklch(0.99 0.003 95)',
  },
  backBtn: {
    height: 40, padding: '0 16px', borderRadius: 10,
    border: '1px solid var(--line)', background: 'white',
    fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer',
  },
  nextBtn: {
    height: 40, padding: '0 22px', borderRadius: 10,
    border: 'none', background: 'var(--ink)', color: 'white',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.005em',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },

  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, gridColumn: '1 / -1' },
  typeCard: (selected) => ({
    padding: '16px 16px 18px', textAlign: 'left',
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
    borderRadius: 12, background: selected ? 'var(--accent-wash)' : 'white',
    cursor: 'pointer', transition: 'all .12s',
    boxShadow: selected ? '0 0 0 3px oklch(0.68 0.12 275 / 0.18)' : 'none',
  }),
  typeLabel: { fontSize: 14, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 },
  typeStatute: { fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'var(--ink-faint)', fontWeight: 400 },
  typeDesc: { fontSize: 12, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 },

  planRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, gridColumn: '1 / -1' },
  planCard: (selected) => ({
    padding: '20px', position: 'relative', cursor: 'pointer',
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
    borderRadius: 14, background: 'white', transition: 'all .12s',
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
  subSuffix: { padding: '0 14px', display: 'flex', alignItems: 'center', background: 'oklch(0.96 0.005 95)', borderLeft: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-soft)', fontFamily: '"JetBrains Mono", monospace' },

  terms: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 20, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 },
  checkbox: { width: 16, height: 16, marginTop: 2, accentColor: 'oklch(0.68 0.12 275)' },

  helperPanel: {
    borderLeft: '1px solid var(--line-soft)',
    padding: '36px 32px',
    background: 'oklch(0.98 0.004 95)',
    display: 'flex', flexDirection: 'column', gap: 22,
    fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55,
  },
  helperEyebrow: { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: '"JetBrains Mono", monospace' },
  helperH: { fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '2px 0 0' },
  helperPara: { margin: 0 },
  divider: { height: 1, background: 'var(--line-soft)', border: 'none' },
};

function Field({ label, children, full, hint, optional, error, span }) {
  const style = { display: 'block', minWidth: 0 };
  if (full) Object.assign(style, cleanStyles.fieldFull);
  if (span) style.gridColumn = `span ${span}`;
  return (
    <label style={style}>
      {label && (
        <span style={{ ...cleanStyles.label, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span>{label}</span>
          {optional && <span style={{ fontWeight: 400, color: 'var(--ink-faint)', fontSize: 11 }}>Optional</span>}
        </span>
      )}
      {children}
      {hint && !error && <div style={cleanStyles.hint}>{hint}</div>}
      {error && <div style={{ ...cleanStyles.hint, color: 'oklch(0.52 0.14 25)' }}>{error}</div>}
    </label>
  );
}

// Floating-label input. Label sits inside the box, rises to top-left on focus/fill.
function FloatField({ label, value, onChange, type = 'text', full, span, hint, suffix, autoComplete }) {
  const [focused, setFocused] = React.useState(false);
  const float = focused || !!value;
  const style = { display: 'block', minWidth: 0, position: 'relative' };
  if (full) Object.assign(style, cleanStyles.fieldFull);
  if (span) style.gridColumn = `span ${span}`;
  return (
    <label style={style}>
      <div style={{
        position: 'relative', height: 52,
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 10, background: 'white',
        boxShadow: focused ? '0 0 0 3px oklch(0.68 0.12 275 / 0.15)' : 'none',
        transition: 'border-color .15s, box-shadow .15s',
        display: 'flex', alignItems: 'stretch',
      }}>
        <span style={{
          position: 'absolute', left: 14,
          top: float ? 8 : '50%',
          transform: float ? 'none' : 'translateY(-50%)',
          fontSize: float ? 10.5 : 14,
          letterSpacing: float ? '0.03em' : 0,
          textTransform: float ? 'uppercase' : 'none',
          color: float ? 'var(--ink-faint)' : 'var(--ink-faint)',
          fontWeight: float ? 500 : 400,
          pointerEvents: 'none',
          transition: 'all .15s cubic-bezier(0.2,0.8,0.2,1)',
          fontFamily: float ? '"JetBrains Mono", monospace' : 'inherit',
        }}>{label}</span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1, height: '100%',
            padding: '18px 14px 6px',
            border: 'none', outline: 'none',
            background: 'transparent',
            fontSize: 14, color: 'var(--ink)',
            minWidth: 0,
          }}
        />
        {suffix && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', background: 'oklch(0.96 0.005 95)', borderLeft: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-soft)', fontFamily: '"JetBrains Mono", monospace', borderRadius: '0 9px 9px 0' }}>
            {suffix}
          </div>
        )}
      </div>
      {hint && <div style={cleanStyles.hint}>{hint}</div>}
    </label>
  );
}

// Section heading used inside multi-group steps
function SectionHead({ num, title, desc }) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: -4, minWidth: 0 }}>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-faint)', flexShrink: 0 }}>{num}</span>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{title}</h3>
      {desc && <span style={{ fontSize: 12, color: 'var(--ink-faint)', marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{desc}</span>}
    </div>
  );
}

// Password strength meter
function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score: s, label: labels[s] };
}

function PasswordStrength({ pw, confirm }) {
  const { score, label } = passwordStrength(pw);
  const segs = 5;
  const match = pw && confirm && pw === confirm;
  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', gap: 3 }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < score ? (score < 3 ? 'oklch(0.70 0.15 45)' : score < 4 ? 'oklch(0.72 0.13 95)' : 'oklch(0.62 0.13 160)') : 'var(--line)',
            transition: 'background .2s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)', minWidth: 64, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace' }}>
        {label || '—'}
      </span>
      {pw && confirm && (
        <span style={{ fontSize: 11, color: match ? 'oklch(0.55 0.12 160)' : 'oklch(0.55 0.14 25)', minWidth: 56, textAlign: 'right' }}>
          {match ? '✓ match' : '✗ differ'}
        </span>
      )}
    </div>
  );
}

function CleanWizard({ tweaks }) {
  const steps = getSteps(tweaks.stepCount);
  const { idx, step, next, prev, go, total } = useWizard(steps);
  const [data, update] = useSignupState();
  const gap = spacePx(tweaks.spacing, { tight: 12, regular: 18, airy: 24 });
  const progress = ((idx + 1) / total) * 100;
  const showPanel = tweaks.showHelperPanel;

  return (
    <div style={{ ...cleanStyles.shell, display: 'grid', gridTemplateColumns: showPanel ? '1fr 280px' : '1fr' }}>
      <div style={cleanStyles.shell}>
        <div style={cleanStyles.topbar}>
          <div style={cleanStyles.brand}>
            <span style={cleanStyles.brandDot}></span>
            PropertyPro
          </div>
          <div style={cleanStyles.help}>
            Already have an account? <a href="#" style={cleanStyles.helpLink}>Log in</a>
          </div>
        </div>

        <div style={cleanStyles.progressWrap}>
          <div style={cleanStyles.progressBar}>
            <div style={{ ...cleanStyles.progressFill, width: `${progress}%` }}></div>
          </div>
          <div style={cleanStyles.stepperRow}>
            {steps.map((s, i) => {
              const state = i < idx ? 'done' : i === idx ? 'current' : 'locked';
              return (
                <button key={s.id} onClick={() => i <= idx && go(i)} style={{ ...cleanStyles.stepChip(state), background: 'none', border: 'none', padding: 0 }}>
                  <div style={cleanStyles.stepNum(state)}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={cleanStyles.stepTitle(state)}>{s.title}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={cleanStyles.body}>
          <div style={cleanStyles.eyebrow}>Step {String(idx + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}</div>
          <h1 style={cleanStyles.h1}>{step.title}</h1>
          <p style={cleanStyles.sub}>{step.sub}</p>

          <CleanStepBody step={step} data={data} update={update} gap={gap} />
        </div>

        <div style={cleanStyles.footer}>
          <button style={{ ...cleanStyles.backBtn, visibility: idx === 0 ? 'hidden' : 'visible' }} onClick={prev}>← Back</button>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            No credit card required · 14-day free trial
          </div>
          {idx === total - 1 ? (
            <button style={cleanStyles.nextBtn}>Create account →</button>
          ) : (
            <button style={cleanStyles.nextBtn} onClick={next}>Continue →</button>
          )}
        </div>
      </div>

      {showPanel && (
        <aside style={cleanStyles.helperPanel}>
          <div>
            <div style={cleanStyles.helperEyebrow}>What to expect</div>
            <h3 style={cleanStyles.helperH}>15 minutes to compliant</h3>
            <p style={{ ...cleanStyles.helperPara, marginTop: 8 }}>
              Most communities finish setup in under 15 minutes. You can invite your board later.
            </p>
          </div>
          <hr style={cleanStyles.divider} />
          <div>
            <div style={cleanStyles.helperEyebrow}>Florida statute</div>
            <h3 style={cleanStyles.helperH}>§718.111(12)(g)</h3>
            <p style={{ ...cleanStyles.helperPara, marginTop: 8 }}>
              Condominium associations of 25+ units must maintain a compliant website. PropertyPro handles posting windows, categories, and retention automatically.
            </p>
          </div>
          <hr style={cleanStyles.divider} />
          <div>
            <div style={cleanStyles.helperEyebrow}>Need help?</div>
            <p style={cleanStyles.helperPara}>
              Email <span style={{ color: 'var(--ink)', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>support@getpropertypro.com</span> or book a 20-minute onboarding call.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

function CleanStepBody({ step, data, update, gap }) {
  if (step.id === 'account') {
    return (
      <div style={cleanStyles.formSection(gap)}>
        <SectionHead num="01" title="Your name" desc="Appears on compliance filings" />
        <FloatField label="First name" value={data.firstName} onChange={(e) => update('firstName', e.target.value)} autoComplete="given-name" />
        <FloatField label="Last name" value={data.lastName} onChange={(e) => update('lastName', e.target.value)} autoComplete="family-name" />

        <SectionHead num="02" title="Your role" desc="So we can tailor the dashboard" />
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {ROLES.map((r) => {
            const selected = data.role === r.id;
            return (
              <button key={r.id} type="button" onClick={() => update('role', r.id)} style={{
                textAlign: 'left', padding: '12px 14px', cursor: 'pointer',
                border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                background: selected ? 'var(--accent-wash)' : 'white',
                borderRadius: 10, transition: 'all .12s',
                boxShadow: selected ? '0 0 0 3px oklch(0.68 0.12 275 / 0.15)' : 'none',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                  border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                  background: 'white', transition: 'all .12s',
                }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>{r.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <SectionHead num="03" title="Login details" desc="You'll use these to sign in" />
        <FloatField label="Email" value={data.email} onChange={(e) => update('email', e.target.value)} full autoComplete="email" type="email" />
        <FloatField label="Password" type="password" value={data.password} onChange={(e) => update('password', e.target.value)} />
        <FloatField label="Confirm password" type="password" value={data.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} />
        <div style={{ gridColumn: '1 / -1' }}>
          <PasswordStrength pw={data.password} confirm={data.confirmPassword} />
        </div>
      </div>
    );
  }

  if (step.id === 'community' || step.id === 'address') {
    return (
      <div style={cleanStyles.formSection(gap)}>
        <SectionHead num="01" title="Community identity" />
        <Field label="Community name" full hint="As it appears on official governing documents">
          <input style={cleanStyles.input} placeholder="Seabreeze Towers Condominium Association" value={data.community} onChange={(e) => update('community', e.target.value)} />
        </Field>

        <SectionHead num="02" title="Property address" desc="Used for jurisdiction & filings" />
        <Field label="Street address" full>
          <input style={cleanStyles.input} placeholder="123 Ocean Blvd" value={data.street} onChange={(e) => update('street', e.target.value)} />
        </Field>
        <Field label="City">
          <input style={cleanStyles.input} placeholder="West Palm Beach" value={data.city} onChange={(e) => update('city', e.target.value)} />
        </Field>
        <Field label="County">
          <input style={cleanStyles.input} placeholder="Palm Beach" value={data.county} onChange={(e) => update('county', e.target.value)} />
        </Field>
        <Field label="State">
          <input style={cleanStyles.input} value={data.state} onChange={(e) => update('state', e.target.value)} />
        </Field>
        <Field label="ZIP">
          <input style={cleanStyles.input} placeholder="33401" value={data.zip} onChange={(e) => update('zip', e.target.value)} />
        </Field>

        <SectionHead num="03" title="Community type" desc="Drives statute-specific workflows" />
        <div style={cleanStyles.typeGrid}>
          {COMMUNITY_TYPES.map((t) => {
            const selected = data.type === t.id;
            return (
              <button key={t.id} type="button" style={cleanStyles.typeCard(selected)} onClick={() => update('type', t.id)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 999,
                    border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                    background: 'white',
                  }} />
                  <span style={cleanStyles.typeStatute}>{t.statute}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t.label}</div>
                <p style={cleanStyles.typeDesc}>{t.desc}</p>
              </button>
            );
          })}
        </div>

        <Field label="Unit count" hint={(() => {
          if (data.type === 'condo') return data.units >= 25 ? 'Subject to §718.111(12)(g) website rule' : 'Exempt — voluntary compliance recommended';
          if (data.type === 'hoa') return data.units >= 100 ? 'Subject to §720.303(4) website rule' : 'Exempt — voluntary compliance recommended';
          return 'Operational-only · no statutory requirements';
        })()}>
          <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', height: 42 }}>
            <button type="button" onClick={() => update('units', Math.max(1, data.units - 1))} style={{
              width: 36, border: 'none', borderRight: '1px solid var(--line)',
              background: 'white', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)',
            }}>−</button>
            <input type="number" value={data.units} onChange={(e) => update('units', Math.max(1, +e.target.value || 1))} style={{
              width: 72, border: 'none', fontSize: 14, fontWeight: 500, textAlign: 'center', outline: 'none',
              fontFeatureSettings: '"tnum"', background: 'transparent',
            }} />
            <button type="button" onClick={() => update('units', data.units + 1)} style={{
              width: 36, border: 'none', borderLeft: '1px solid var(--line)',
              background: 'white', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)',
            }}>+</button>
          </div>
        </Field>
        <div />
      </div>
    );
  }

  if (step.id === 'plan') {
    const savings = data.billing === 'annual' ? '· save ~15%' : '';
    return (
      <div style={cleanStyles.formSection(gap)}>
        {/* Billing cycle toggle */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Billing cycle <span style={{ color: 'var(--ink-faint)' }}>{savings}</span>
          </div>
          <div style={{ display: 'inline-flex', padding: 3, border: '1px solid var(--line)', borderRadius: 999, background: 'white' }}>
            {['monthly', 'annual'].map((opt) => {
              const sel = data.billing === opt;
              return (
                <button key={opt} type="button" onClick={() => update('billing', opt)} style={{
                  padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
                  background: sel ? 'var(--ink)' : 'transparent',
                  color: sel ? 'white' : 'var(--ink-soft)',
                  transition: 'background .15s',
                }}>{opt}</button>
              );
            })}
          </div>
        </div>

        <div style={cleanStyles.planRow}>
          {PLANS.map((p) => {
            const selected = data.plan === p.id;
            const monthly = data.billing === 'annual' ? Math.round(p.price * 0.85) : p.price;
            return (
              <button key={p.id} type="button" style={cleanStyles.planCard(selected)} onClick={() => update('plan', p.id)}>
                {p.recommended && (
                  <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'white', background: 'var(--accent)', padding: '3px 8px', borderRadius: 999, fontWeight: 600 }}>
                    Recommended
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 999,
                    border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                    background: 'white', flexShrink: 0,
                  }} />
                  <h4 style={cleanStyles.planName}>{p.name}</h4>
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>$</span>
                  <span style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.03em', fontFeatureSettings: '"tnum"', lineHeight: 1 }}>{monthly}</span>
                  <span style={cleanStyles.planPriceUnit}>&nbsp;/ month{data.billing === 'annual' ? ', billed annually' : ''}</span>
                </div>
                <p style={cleanStyles.planBlurb}>{p.blurb}</p>
                <div style={{ height: 1, background: 'var(--line-soft)', margin: '2px 0 14px' }} />
                <ul style={cleanStyles.planBullets}>
                  {p.bullets.map((b) => (
                    <li key={b} style={cleanStyles.planBullet}>
                      <span style={{ position: 'absolute', left: 0, top: 5, width: 12, height: 12, borderRadius: 999, background: 'var(--accent-wash)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)', fontSize: 9, fontWeight: 700 }}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 4 }}>
          Not sure which plan? <a href="#" style={{ color: 'var(--accent-ink)' }}>Compare all features →</a>
        </div>
      </div>
    );
  }

  if (step.id === 'finish') {
    const planObj = PLANS.find((p) => p.id === data.plan);
    const monthly = data.billing === 'annual' ? Math.round(planObj.price * 0.85) : planObj.price;
    return (
      <div style={cleanStyles.formSection(gap)}>
        <SectionHead num="01" title="Your portal address" desc="You can change this later" />
        <FloatField label="Subdomain" value={data.subdomain} onChange={(e) => update('subdomain', e.target.value)} full suffix=".getpropertypro.com" hint="Suggested from your community name. Lowercase letters, numbers, and dashes only." />
        {/* URL preview bar */}
        <div style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '8px 12px', background: 'oklch(0.97 0.005 95)', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.85 0.1 25)' }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.88 0.12 90)' }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.85 0.1 150)' }} />
            <div style={{ flex: 1, margin: '0 12px', padding: '4px 10px', background: 'white', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--ink-soft)' }}>
              <span style={{ color: 'oklch(0.58 0.13 160)' }}>https://</span>{(data.subdomain || 'your-community')}<span style={{ color: 'var(--ink-faint)' }}>.getpropertypro.com</span>
            </div>
          </div>
        </div>

        <SectionHead num="02" title="Review your signup" />
        <div style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 12, background: 'white', overflow: 'hidden' }}>
          {[
            ['Primary contact', `${data.firstName || '—'} ${data.lastName || ''}`.trim()],
            ['Email', data.email || '—'],
            ['Role', ROLES.find(r => r.id === data.role)?.label || '—'],
            ['Community', data.community || '—'],
            ['Type & units', `${COMMUNITY_TYPES.find(t=>t.id===data.type)?.label} · ${data.units} units`],
            ['Plan', `${planObj.name} · $${monthly}/mo${data.billing === 'annual' ? ' (annual)' : ''}`],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{
              display: 'grid', gridTemplateColumns: '160px 1fr',
              padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none',
              fontSize: 13,
            }}>
              <div style={{ color: 'var(--ink-faint)' }}>{k}</div>
              <div style={{ color: 'var(--ink)' }}>{v}</div>
            </div>
          ))}
        </div>

        <label style={{ ...cleanStyles.terms, gridColumn: '1 / -1' }}>
          <input type="checkbox" style={cleanStyles.checkbox} checked={data.agree} onChange={(e) => update('agree', e.target.checked)} />
          <span>I agree to the <a href="#" style={{ color: 'var(--accent-ink)' }}>Terms of Service</a> and <a href="#" style={{ color: 'var(--accent-ink)' }}>Privacy Policy</a>. Billing begins after your 14-day trial.</span>
        </label>
      </div>
    );
  }

  return null;
}

Object.assign(window, { CleanWizard });
