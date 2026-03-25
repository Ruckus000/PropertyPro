import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const hoaPublicBoardTransparency: DemoTemplateDefinition = {
  id: 'hoa-public-board-transparency',
  communityType: 'hoa_720',
  variant: 'public',
  name: 'Board Transparency',
  tags: ['Documents', 'Transparency'],
  bestFor: 'HOA boards that prioritize open governance and document accessibility',
  thumbnail: {
    gradient: ['#1E3A5F', '#3B82F6'],
    layout: 'split-feature',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#1E3A5F';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#1D4ED8';
    const accentColor = ctx.branding?.accentColor ?? '#DBEAFE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#F8FAFC', color: '#1E293B' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '19px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerRight: { display: 'flex', gap: '16px', alignItems: 'center' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '13px' },
    heroStrip: { background: '${secondaryColor}', color: '#fff', padding: '40px 24px', textAlign: 'center' },
    heroTitle: { fontSize: '30px', fontFamily: '${fontHeading}', margin: '0 0 10px', fontWeight: '700' },
    heroSubtitle: { fontSize: '15px', opacity: '0.85', margin: 0 },
    featureRow: { display: 'flex', alignItems: 'center', gap: '0', padding: '40px 24px', maxWidth: '900px', margin: '0 auto', borderBottom: '1px solid #E2E8F0' },
    featureRowReverse: { display: 'flex', alignItems: 'center', gap: '0', padding: '40px 24px', maxWidth: '900px', margin: '0 auto', flexDirection: 'row-reverse', borderBottom: '1px solid #E2E8F0' },
    featureText: { flex: 1, paddingRight: '40px' },
    featureTextReverse: { flex: 1, paddingLeft: '40px' },
    featureTag: { fontSize: '11px', fontWeight: '700', color: '${secondaryColor}', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
    featureTitle: { fontSize: '20px', fontFamily: '${fontHeading}', fontWeight: '700', color: '${primaryColor}', margin: '0 0 10px' },
    featureDesc: { fontSize: '14px', color: '#475569', lineHeight: '1.7', margin: '0 0 16px' },
    featureLink: { color: '${secondaryColor}', fontWeight: '600', fontSize: '14px', textDecoration: 'none' },
    featureVisual: { flex: 1, background: '${accentColor}', borderRadius: '12px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '8px' },
    docRow: { background: '#fff', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' },
    docIcon: { fontSize: '18px' },
    docName: { fontSize: '13px', fontWeight: '600', color: '#1E293B', flex: 1 },
    docDate: { fontSize: '11px', color: '#94A3B8' },
    complianceBadge: { background: '#DCFCE7', color: '#166534', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600' },
    footer: { background: '${primaryColor}', color: '${accentColor}', textAlign: 'center', padding: '14px', fontSize: '12px', marginTop: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('div', { style: styles.headerRight },
        React.createElement('a', { href: '#', style: styles.navLink }, 'Documents'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Board'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Meetings'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('div', { style: styles.heroStrip },
      React.createElement('h2', { style: styles.heroTitle }, 'Open Governance for ${communityName}'),
      React.createElement('p', { style: styles.heroSubtitle }, 'Every decision, document, and meeting — visible to all homeowners.')
    ),
    React.createElement('div', { style: styles.featureRow },
      React.createElement('div', { style: styles.featureText },
        React.createElement('p', { style: styles.featureTag }, 'Document Library'),
        React.createElement('h3', { style: styles.featureTitle }, 'All Governing Documents in One Place'),
        React.createElement('p', { style: styles.featureDesc }, 'CC&Rs, bylaws, rules and regulations, and financial reports posted within 30 days of creation — in full compliance with Florida §720.303.'),
        React.createElement('a', { href: '#', style: styles.featureLink }, 'Browse Documents →')
      ),
      React.createElement('div', { style: styles.featureVisual },
        React.createElement('div', { style: styles.docRow },
          React.createElement('span', { style: styles.docIcon }, '📋'),
          React.createElement('span', { style: styles.docName }, 'CC&Rs 2024'),
          React.createElement('span', { style: styles.docDate }, 'Jan 2024')
        ),
        React.createElement('div', { style: styles.docRow },
          React.createElement('span', { style: styles.docIcon }, '📊'),
          React.createElement('span', { style: styles.docName }, 'Annual Budget'),
          React.createElement('span', { style: styles.docDate }, 'Feb 2025')
        ),
        React.createElement('div', { style: styles.docRow },
          React.createElement('span', { style: styles.docIcon }, '📝'),
          React.createElement('span', { style: styles.docName }, 'Board Minutes — Feb'),
          React.createElement('span', { style: styles.docDate }, 'Mar 2025')
        )
      )
    ),
    React.createElement('div', { style: styles.featureRowReverse },
      React.createElement('div', { style: styles.featureTextReverse },
        React.createElement('p', { style: styles.featureTag }, 'Compliance'),
        React.createElement('h3', { style: styles.featureTitle }, 'Florida §720 Compliance at a Glance'),
        React.createElement('p', { style: styles.featureDesc }, 'Our community maintains a real-time compliance score tracked by PropertyPro. Homeowners can verify document posting timeliness and meeting notice compliance.'),
        React.createElement('a', { href: '#', style: styles.featureLink }, 'View Compliance Report →')
      ),
      React.createElement('div', { style: styles.featureVisual },
        React.createElement('div', { style: { textAlign: 'center', padding: '8px 0' } },
          React.createElement('p', { style: { fontSize: '40px', fontWeight: '800', color: '${primaryColor}', margin: '0 0 4px' } }, '97%'),
          React.createElement('p', { style: { fontSize: '14px', color: '#475569', margin: '0 0 12px' } }, 'Compliance Score'),
          React.createElement('span', { style: styles.complianceBadge }, 'All Documents Current')
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
