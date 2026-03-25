import type { DemoTemplateDefinition } from './types';

export const condoPublicCivicGlass: DemoTemplateDefinition = {
  id: 'condo-public-civic-glass',
  communityType: 'condo_718',
  variant: 'public',
  name: 'Civic Glass',
  tags: ['Formal', 'Board-forward'],
  bestFor: 'Board transparency and compliance-focused communities',
  thumbnail: {
    gradient: ['#1E40AF', '#2563EB'],
    layout: 'stats-hero',
  },
  build(ctx) {
    const primaryColor = ctx.branding?.primaryColor ?? '#1E40AF';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#1E3A8A';
    const accentColor = ctx.branding?.accentColor ?? '#DBEAFE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#F8FAFC', color: '#1E293B' },
    header: { background: '${primaryColor}', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '20px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerNav: { display: 'flex', gap: '16px' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '14px' },
    hero: { background: '${secondaryColor}', color: '#fff', padding: '48px 24px', textAlign: 'center' },
    heroTitle: { fontSize: '32px', fontFamily: '${fontHeading}', margin: '0 0 12px', fontWeight: '700' },
    heroSubtitle: { fontSize: '16px', opacity: '0.85', margin: 0 },
    statsRow: { display: 'flex', gap: '16px', padding: '24px', justifyContent: 'center', flexWrap: 'wrap' },
    statCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '20px 28px', textAlign: 'center', minWidth: '120px' },
    statNumber: { fontSize: '28px', fontWeight: '700', color: '${primaryColor}', margin: '0 0 4px' },
    statLabel: { fontSize: '12px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' },
    section: { padding: '24px', maxWidth: '800px', margin: '0 auto' },
    sectionTitle: { fontSize: '18px', fontFamily: '${fontHeading}', fontWeight: '700', color: '#1E293B', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '2px solid ${primaryColor}' },
    featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' },
    featureCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' },
    featureIcon: { fontSize: '24px', marginBottom: '8px' },
    featureTitle: { fontSize: '14px', fontWeight: '600', margin: '0 0 4px' },
    featureDesc: { fontSize: '13px', color: '#64748B', margin: 0 },
    footer: { background: '${primaryColor}', color: '${accentColor}', textAlign: 'center', padding: '16px', fontSize: '13px', marginTop: '32px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('nav', { style: styles.headerNav },
        React.createElement('a', { href: '#', style: styles.navLink }, 'Documents'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Meetings'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('section', { style: styles.hero },
      React.createElement('h2', { style: styles.heroTitle }, 'Welcome to ${communityName}'),
      React.createElement('p', { style: styles.heroSubtitle }, 'Transparency, compliance, and community — all in one place.')
    ),
    React.createElement('div', { style: styles.statsRow },
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '98%'),
        React.createElement('p', { style: styles.statLabel }, 'Compliance Score')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '12'),
        React.createElement('p', { style: styles.statLabel }, 'Posted Docs')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '4'),
        React.createElement('p', { style: styles.statLabel }, 'Board Members')
      ),
      React.createElement('div', { style: styles.statCard },
        React.createElement('p', { style: styles.statNumber }, '3'),
        React.createElement('p', { style: styles.statLabel }, 'Upcoming Meetings')
      )
    ),
    React.createElement('section', { style: styles.section },
      React.createElement('h3', { style: styles.sectionTitle }, 'Community Features'),
      React.createElement('div', { style: styles.featureGrid },
        React.createElement('div', { style: styles.featureCard },
          React.createElement('div', { style: styles.featureIcon }, '📄'),
          React.createElement('p', { style: styles.featureTitle }, 'Document Library'),
          React.createElement('p', { style: styles.featureDesc }, 'Access board minutes, budgets, and governing docs.')
        ),
        React.createElement('div', { style: styles.featureCard },
          React.createElement('div', { style: styles.featureIcon }, '📅'),
          React.createElement('p', { style: styles.featureTitle }, 'Meeting Schedule'),
          React.createElement('p', { style: styles.featureDesc }, 'Stay informed about upcoming board and owner meetings.')
        ),
        React.createElement('div', { style: styles.featureCard },
          React.createElement('div', { style: styles.featureIcon }, '📢'),
          React.createElement('p', { style: styles.featureTitle }, 'Announcements'),
          React.createElement('p', { style: styles.featureDesc }, 'Official community notices and updates from the board.')
        ),
        React.createElement('div', { style: styles.featureCard },
          React.createElement('div', { style: styles.featureIcon }, '✅'),
          React.createElement('p', { style: styles.featureTitle }, 'Compliance Tracker'),
          React.createElement('p', { style: styles.featureDesc }, 'Florida §718 compliance status at a glance.')
        )
      )
    ),
    React.createElement('footer', { style: styles.footer },
      '© ${communityName}. Powered by PropertyPro Florida.'
    )
  );
}`;
  },
};
