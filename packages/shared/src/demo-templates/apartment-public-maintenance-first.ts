import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const apartmentPublicMaintenanceFirst: DemoTemplateDefinition = {
  id: 'apartment-public-maintenance-first',
  communityType: 'apartment',
  variant: 'public',
  name: 'Maintenance First',
  tags: ['Maintenance', 'Dashboard'],
  bestFor: 'Apartment communities where maintenance responsiveness is the top priority',
  thumbnail: {
    gradient: ['#92400E', '#F59E0B'],
    layout: 'stats-hero',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#92400E';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#B45309';
    const accentColor = ctx.branding?.accentColor ?? '#FEF3C7';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#FFFBEB', color: '#1C1917' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '19px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerNav: { display: 'flex', gap: '18px' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '13px' },
    hero: { background: '${secondaryColor}', color: '#fff', padding: '40px 24px', textAlign: 'center' },
    heroTitle: { fontSize: '28px', fontFamily: '${fontHeading}', margin: '0 0 10px', fontWeight: '700' },
    heroSubtitle: { fontSize: '15px', opacity: '0.88', margin: '0 0 20px' },
    heroCta: { background: '#fff', color: '${primaryColor}', padding: '11px 28px', borderRadius: '8px', fontWeight: '700', fontSize: '14px', display: 'inline-block', textDecoration: 'none' },
    statsRow: { display: 'flex', gap: '12px', padding: '24px', justifyContent: 'center', flexWrap: 'wrap', background: '#fff', borderBottom: '1px solid #FDE68A' },
    statCard: { background: '${accentColor}', border: '1px solid #FCD34D', borderRadius: '10px', padding: '18px 24px', textAlign: 'center', minWidth: '110px' },
    statNumber: { fontSize: '28px', fontWeight: '800', color: '${primaryColor}', margin: '0 0 4px', lineHeight: 1 },
    statLabel: { fontSize: '11px', color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 },
    requestSection: { padding: '32px 24px', maxWidth: '800px', margin: '0 auto' },
    sectionTitle: { fontSize: '18px', fontFamily: '${fontHeading}', fontWeight: '700', color: '${primaryColor}', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '2px solid #FCD34D' },
    requestTypes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' },
    requestType: { background: '#fff', border: '1px solid #FDE68A', borderRadius: '10px', padding: '16px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
    requestTypeIcon: { fontSize: '28px', marginBottom: '8px' },
    requestTypeLabel: { fontSize: '13px', fontWeight: '600', color: '${secondaryColor}', margin: 0 },
    recentRow: { background: '#fff', border: '1px solid #FDE68A', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
    recentLeft: {},
    recentTitle: { fontSize: '14px', fontWeight: '600', color: '#1C1917', margin: '0 0 2px' },
    recentMeta: { fontSize: '12px', color: '#78350F', margin: 0 },
    recentStatus: { background: '#D1FAE5', color: '#065F46', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600' },
    recentStatusPending: { background: '#FEF3C7', color: '${primaryColor}', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600' },
    footer: { background: '${primaryColor}', color: '${accentColor}', textAlign: 'center', padding: '14px', fontSize: '12px', marginTop: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('nav', { style: styles.headerNav },
        React.createElement('a', { href: '#', style: styles.navLink }, 'Requests'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Status'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('section', { style: styles.hero },
      React.createElement('h2', { style: styles.heroTitle }, 'Maintenance at ${communityName}'),
      React.createElement('p', { style: styles.heroSubtitle }, 'Fast, responsive maintenance — submit a request and we handle the rest.'),
      React.createElement('a', { href: '#', style: styles.heroCta }, 'Submit a Request')
    ),
    React.createElement('div', { style: styles.statsRow },
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '4hr'),
        React.createElement('p', { style: styles.statLabel }, 'Avg Response')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '97%'),
        React.createElement('p', { style: styles.statLabel }, 'Resolved in 48hr')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '248'),
        React.createElement('p', { style: styles.statLabel }, 'Requests This Year')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '4.8★'),
        React.createElement('p', { style: styles.statLabel }, 'Resident Rating')
      )
    ),
    React.createElement('section', { style: styles.requestSection },
      React.createElement('h3', { style: styles.sectionTitle }, 'Submit a Request'),
      React.createElement('div', { style: styles.requestTypes },
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'Plumbing')
        ),
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'Electrical')
        ),
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'HVAC')
        ),
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'Locks & Doors')
        ),
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'Pest Control')
        ),
        React.createElement('div', { style: styles.requestType },
          React.createElement('p', { style: styles.requestTypeLabel }, 'Other')
        )
      ),
      React.createElement('h3', { style: styles.sectionTitle }, 'Recent Activity'),
      React.createElement('div', { style: styles.recentRow },
        React.createElement('div', { style: styles.recentLeft },
          React.createElement('p', { style: styles.recentTitle }, 'Kitchen faucet dripping — Unit 204'),
          React.createElement('p', { style: styles.recentMeta }, 'Submitted 2 days ago')
        ),
        React.createElement('span', { style: styles.recentStatus }, 'Completed')
      ),
      React.createElement('div', { style: styles.recentRow },
        React.createElement('div', { style: styles.recentLeft },
          React.createElement('p', { style: styles.recentTitle }, 'AC not cooling — Unit 318'),
          React.createElement('p', { style: styles.recentMeta }, 'Submitted 1 day ago')
        ),
        React.createElement('span', { style: styles.recentStatusPending }, 'In Progress')
      ),
      React.createElement('div', { style: styles.recentRow },
        React.createElement('div', { style: styles.recentLeft },
          React.createElement('p', { style: styles.recentTitle }, 'Hallway light out — 3rd floor'),
          React.createElement('p', { style: styles.recentMeta }, 'Submitted today')
        ),
        React.createElement('span', { style: styles.recentStatusPending }, 'Scheduled')
      )
    ),
    React.createElement('footer', { style: styles.footer },
      '© ${communityName}. Powered by PropertyPro Florida.'
    )
  );
}`;
  },
};
