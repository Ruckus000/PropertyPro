import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const hoaMobileCommunityPulse: DemoTemplateDefinition = {
  id: 'hoa-mobile-community-pulse',
  communityType: 'hoa_720',
  variant: 'mobile',
  name: 'Community Pulse',
  tags: ['Events', 'Community'],
  bestFor: 'HOA residents who want a mobile-first view of community events and announcements',
  thumbnail: {
    gradient: ['#065F46', '#111827'],
    layout: 'feed-list',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#065F46';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#047857';
    const accentColor = ctx.branding?.accentColor ?? '#D1FAE5';
    const fontHeading = ctx.branding?.fontHeading ?? 'Inter, sans-serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#0A0F0D', color: '#ECFDF5', minHeight: '100vh' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '17px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerDate: { fontSize: '12px', color: '${accentColor}', opacity: 0.85 },
    eventBanner: { background: '${secondaryColor}', margin: '12px', borderRadius: '10px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' },
    eventBannerDateBox: { background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '8px 12px', textAlign: 'center', minWidth: '46px' },
    eventBannerDay: { fontSize: '22px', fontWeight: '800', display: 'block', lineHeight: 1, color: '#fff' },
    eventBannerMon: { fontSize: '10px', textTransform: 'uppercase', color: '${accentColor}' },
    eventBannerBody: { flex: 1 },
    eventBannerTitle: { fontSize: '15px', fontWeight: '700', color: '#fff', margin: '0 0 3px' },
    eventBannerSub: { fontSize: '12px', color: '${accentColor}', margin: 0 },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6EE7B7', padding: '14px 16px 8px' },
    feedItem: { margin: '0 12px 10px', background: '#111A14', borderRadius: '10px', padding: '14px', border: '1px solid #14532D' },
    feedItemEvent: { margin: '0 12px 10px', background: '#052E16', borderRadius: '10px', padding: '14px', border: '1px solid ${secondaryColor}' },
    feedType: { fontSize: '11px', fontWeight: '700', color: '#6EE7B7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTypeEvent: { fontSize: '11px', fontWeight: '700', color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTitle: { fontSize: '15px', fontWeight: '600', color: '#ECFDF5', margin: '0 0 4px' },
    feedBody: { fontSize: '13px', color: '#A7F3D0', lineHeight: '1.5', margin: '0 0 6px' },
    feedMeta: { fontSize: '12px', color: '#065F46', margin: 0 },
    rsvpBtn: { background: '${secondaryColor}', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', marginTop: '8px' },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#111A14', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #14532D' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#6EE7B7', fontSize: '10px', fontWeight: '600' },
    navItemActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#34D399', fontSize: '10px', fontWeight: '700' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('span', { style: styles.headerDate }, 'March 25, 2025')
    ),
    React.createElement('div', { style: styles.eventBanner },
      React.createElement('div', { style: styles.eventBannerDateBox },
        React.createElement('span', { style: styles.eventBannerDay }, '28'),
        React.createElement('span', { style: styles.eventBannerMon }, 'Mar')
      ),
      React.createElement('div', { style: styles.eventBannerBody },
        React.createElement('p', { style: styles.eventBannerTitle }, 'Annual HOA Meeting — 3 Days Away'),
        React.createElement('p', { style: styles.eventBannerSub }, 'Community Center · 7:00 PM · All homeowners welcome')
      )
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Upcoming Events'),
    React.createElement('div', { style: styles.feedItemEvent },
      React.createElement('p', { style: styles.feedTypeEvent }, 'Community Event'),
      React.createElement('p', { style: styles.feedTitle }, 'Spring Cleanup Day'),
      React.createElement('p', { style: styles.feedBody }, 'Help us beautify the neighborhood! Supplies provided. Rain date: April 12.'),
      React.createElement('p', { style: styles.feedMeta }, 'April 5 · 9:00 AM · Park Entrance'),
      React.createElement('button', { style: styles.rsvpBtn }, 'RSVP')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Community News'),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedType }, 'Announcement'),
      React.createElement('p', { style: styles.feedTitle }, 'Speed Bumps Approved for Oak Lane'),
      React.createElement('p', { style: styles.feedBody }, 'The board voted to install traffic calming on Oak Lane following resident petitions.'),
      React.createElement('p', { style: styles.feedMeta }, 'Board Decision · 2 days ago')
    ),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedType }, 'Maintenance'),
      React.createElement('p', { style: styles.feedTitle }, 'Irrigation System Serviced'),
      React.createElement('p', { style: styles.feedBody }, 'Common area irrigation has been repaired and recalibrated for the spring season.'),
      React.createElement('p', { style: styles.feedMeta }, 'Property Manager · 4 days ago')
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItemActive },
        React.createElement('span', null, 'Pulse')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Events')
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
