import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const hoaPublicNeighborhoodHub: DemoTemplateDefinition = {
  id: 'hoa-public-neighborhood-hub',
  communityType: 'hoa_720',
  variant: 'public',
  name: 'Neighborhood Hub',
  tags: ['Community', 'Neighborhood'],
  bestFor: 'HOAs that value a strong neighborhood identity and community connection',
  thumbnail: {
    gradient: ['#065F46', '#10B981'],
    layout: 'sidebar-content',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#065F46';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#047857';
    const accentColor = ctx.branding?.accentColor ?? '#D1FAE5';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#F0FDF4', color: '#14532D' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '19px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerNav: { display: 'flex', gap: '18px' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '13px', fontWeight: '500' },
    heroBanner: { background: '${secondaryColor}', color: '#fff', padding: '36px 24px' },
    heroTitle: { fontSize: '28px', fontFamily: '${fontHeading}', margin: '0 0 10px', fontWeight: '700' },
    heroSubtitle: { fontSize: '15px', opacity: '0.9', margin: 0, lineHeight: '1.6' },
    layout: { display: 'flex', gap: '0', maxWidth: '960px', margin: '0 auto' },
    sidebar: { width: '240px', flexShrink: 0, background: '#fff', borderRight: '1px solid #D1FAE5', padding: '24px 20px' },
    sidebarTitle: { fontSize: '13px', fontWeight: '700', color: '${primaryColor}', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' },
    sidebarLink: { display: 'block', padding: '8px 12px', borderRadius: '6px', color: '#064E3B', textDecoration: 'none', fontSize: '14px', marginBottom: '4px' },
    sidebarLinkActive: { display: 'block', padding: '8px 12px', borderRadius: '6px', background: '${accentColor}', color: '${primaryColor}', textDecoration: 'none', fontSize: '14px', fontWeight: '600', marginBottom: '4px' },
    main: { flex: 1, padding: '28px 24px' },
    sectionTitle: { fontSize: '17px', fontFamily: '${fontHeading}', fontWeight: '700', color: '${primaryColor}', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '2px solid ${accentColor}' },
    announcementCard: { background: '#fff', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '16px', marginBottom: '12px' },
    annoTitle: { fontSize: '14px', fontWeight: '700', color: '#064E3B', margin: '0 0 4px' },
    annoMeta: { fontSize: '12px', color: '#6B7280', margin: '0 0 6px' },
    annoText: { fontSize: '13px', color: '#374151', margin: 0, lineHeight: '1.5' },
    eventRow: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #D1FAE5' },
    eventDate: { background: '${primaryColor}', color: '#fff', borderRadius: '8px', padding: '8px 10px', textAlign: 'center', minWidth: '44px' },
    eventDateDay: { fontSize: '18px', fontWeight: '700', display: 'block', lineHeight: 1 },
    eventDateMon: { fontSize: '10px', textTransform: 'uppercase' },
    eventTitle: { fontSize: '14px', fontWeight: '600', color: '#064E3B' },
    eventDesc: { fontSize: '12px', color: '#6B7280' },
    footer: { background: '${primaryColor}', color: '${accentColor}', textAlign: 'center', padding: '14px', fontSize: '12px', marginTop: '32px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('nav', { style: styles.headerNav },
        React.createElement('a', { href: '#', style: styles.navLink }, 'News'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Events'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Documents'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('div', { style: styles.heroBanner },
      React.createElement('h2', { style: styles.heroTitle }, 'Your Neighborhood Hub'),
      React.createElement('p', { style: styles.heroSubtitle }, 'Stay informed, stay connected. ${communityName} keeps neighbors in the loop.')
    ),
    React.createElement('div', { style: styles.layout },
      React.createElement('aside', { style: styles.sidebar },
        React.createElement('p', { style: styles.sidebarTitle }, 'Navigate'),
        React.createElement('a', { href: '#', style: styles.sidebarLinkActive }, 'Announcements'),
        React.createElement('a', { href: '#', style: styles.sidebarLink }, 'Upcoming Events'),
        React.createElement('a', { href: '#', style: styles.sidebarLink }, 'Board Members'),
        React.createElement('a', { href: '#', style: styles.sidebarLink }, 'Document Library'),
        React.createElement('a', { href: '#', style: styles.sidebarLink }, 'Governing Docs'),
        React.createElement('a', { href: '#', style: styles.sidebarLink }, 'Contact Office')
      ),
      React.createElement('main', { style: styles.main },
        React.createElement('h3', { style: styles.sectionTitle }, 'Recent Announcements'),
        React.createElement('div', { style: styles.announcementCard },
          React.createElement('p', { style: styles.annoTitle }, 'Landscaping Refresh Project Underway'),
          React.createElement('p', { style: styles.annoMeta }, 'HOA Board · March 20, 2025'),
          React.createElement('p', { style: styles.annoText }, 'The spring landscaping refresh begins this week. Crews will be working Monday through Friday.')
        ),
        React.createElement('div', { style: styles.announcementCard },
          React.createElement('p', { style: styles.annoTitle }, 'Annual Meeting Agenda Posted'),
          React.createElement('p', { style: styles.annoMeta }, 'HOA Secretary · March 15, 2025'),
          React.createElement('p', { style: styles.annoText }, 'The agenda for the upcoming annual homeowner meeting has been posted in the document library.')
        ),
        React.createElement('h3', { style: { ...styles.sectionTitle, marginTop: '24px' } }, 'Upcoming Events'),
        React.createElement('div', { style: styles.eventRow },
          React.createElement('div', { style: styles.eventDate },
            React.createElement('span', { style: styles.eventDateDay }, '28'),
            React.createElement('span', { style: styles.eventDateMon }, 'Mar')
          ),
          React.createElement('div', null,
            React.createElement('p', { style: styles.eventTitle }, 'Annual Homeowner Meeting'),
            React.createElement('p', { style: styles.eventDesc }, 'Community Center · 7:00 PM')
          )
        ),
        React.createElement('div', { style: styles.eventRow },
          React.createElement('div', { style: styles.eventDate },
            React.createElement('span', { style: styles.eventDateDay }, '5'),
            React.createElement('span', { style: styles.eventDateMon }, 'Apr')
          ),
          React.createElement('div', null,
            React.createElement('p', { style: styles.eventTitle }, 'Community Cleanup Day'),
            React.createElement('p', { style: styles.eventDesc }, 'Park Entrance · 9:00 AM')
          )
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
