import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const condoMobileConciergeSnapshot: DemoTemplateDefinition = {
  id: 'condo-mobile-concierge-snapshot',
  communityType: 'condo_718',
  variant: 'mobile',
  name: 'Concierge Snapshot',
  tags: ['Dashboard', 'Quick-access'],
  bestFor: 'Residents who want a quick-access dashboard for all community services',
  thumbnail: {
    gradient: ['#111827', '#2563EB'],
    layout: 'card-grid',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#2563EB';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#1D4ED8';
    const accentColor = ctx.branding?.accentColor ?? '#BFDBFE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Inter, sans-serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#111827', color: '#F9FAFB', minHeight: '100vh' },
    header: { background: '#111827', padding: '20px 16px 12px', borderBottom: '1px solid #1F2937' },
    greeting: { fontSize: '13px', color: '#9CA3AF', margin: '0 0 4px' },
    headerTitle: { margin: 0, fontSize: '22px', fontFamily: '${fontHeading}', fontWeight: '700', color: '#F9FAFB' },
    statusBanner: { background: '#14532D', margin: '12px 16px', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' },
    statusDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', flexShrink: 0 },
    statusText: { fontSize: '13px', color: '#86EFAC', fontWeight: '500' },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280', padding: '16px 16px 10px' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' },
    card: { background: '#1F2937', borderRadius: '12px', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #374151' },
    cardIconWrap: { width: '40px', height: '40px', borderRadius: '10px', background: '${primaryColor}', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' },
    cardLabel: { fontSize: '13px', fontWeight: '600', color: '#F9FAFB', margin: 0 },
    cardSub: { fontSize: '11px', color: '#6B7280', margin: 0 },
    cardAccent: { background: '${secondaryColor}', borderRadius: '12px', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid ${primaryColor}' },
    metaRow: { padding: '16px', display: 'flex', gap: '10px' },
    metaCard: { flex: 1, background: '#1F2937', borderRadius: '10px', padding: '12px', textAlign: 'center', border: '1px solid #374151' },
    metaNumber: { fontSize: '22px', fontWeight: '700', color: '${primaryColor}', margin: '0 0 2px' },
    metaLabel: { fontSize: '11px', color: '#6B7280', margin: 0 },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1F2937', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #374151' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '${accentColor}', fontSize: '10px', fontWeight: '600' },
    navItemActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '${primaryColor}', fontSize: '10px', fontWeight: '700' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('p', { style: styles.greeting }, 'Good morning, Resident'),
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}')
    ),
    React.createElement('div', { style: styles.statusBanner },
      React.createElement('div', { style: styles.statusDot }),
      React.createElement('span', { style: styles.statusText }, 'All systems normal — 98% compliance score')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Quick Access'),
    React.createElement('div', { style: styles.grid },
      React.createElement('div', { style: styles.cardAccent },
        React.createElement('p', { style: styles.cardLabel }, 'Maintenance'),
        React.createElement('p', { style: styles.cardSub }, 'Submit a request')
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('p', { style: styles.cardLabel }, 'Documents'),
        React.createElement('p', { style: styles.cardSub }, '12 files available')
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('p', { style: styles.cardLabel }, 'Meetings'),
        React.createElement('p', { style: styles.cardSub }, 'Next: Tue 7pm')
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('p', { style: styles.cardLabel }, 'Messages'),
        React.createElement('p', { style: styles.cardSub }, '2 unread')
      )
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Community at a Glance'),
    React.createElement('div', { style: styles.metaRow },
      React.createElement('div', { style: styles.metaCard },
        React.createElement('p', { style: styles.metaNumber }, '48'),
        React.createElement('p', { style: styles.metaLabel }, 'Units')
      ),
      React.createElement('div', { style: styles.metaCard },
        React.createElement('p', { style: styles.metaNumber }, '4'),
        React.createElement('p', { style: styles.metaLabel }, 'Board Members')
      ),
      React.createElement('div', { style: styles.metaCard },
        React.createElement('p', { style: styles.metaNumber }, '3'),
        React.createElement('p', { style: styles.metaLabel }, 'Open Requests')
      )
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItemActive },
        React.createElement('span', null, 'Home')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Requests')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Docs')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Account')
      )
    )
  );
}`;
  },
};
