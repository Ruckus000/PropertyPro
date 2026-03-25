import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const condoMobileResidentBulletin: DemoTemplateDefinition = {
  id: 'condo-mobile-resident-bulletin',
  communityType: 'condo_718',
  variant: 'mobile',
  name: 'Resident Bulletin',
  tags: ['News-feed', 'Announcement-first'],
  bestFor: 'Mobile residents who want a quick news feed of community announcements',
  thumbnail: {
    gradient: ['#1E40AF', '#111827'],
    layout: 'feed-list',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#1E40AF';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#1E3A8A';
    const accentColor = ctx.branding?.accentColor ?? '#DBEAFE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Inter, sans-serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#0F172A', color: '#F1F5F9', minHeight: '100vh' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 10 },
    headerTitle: { margin: 0, fontSize: '17px', fontFamily: '${fontHeading}', fontWeight: '700', flex: 1 },
    headerBadge: { background: '#EF4444', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '12px', fontWeight: '700' },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', padding: '16px 16px 8px' },
    feedItem: { background: '#1E293B', margin: '0 12px 10px', borderRadius: '10px', padding: '14px', borderLeft: '3px solid ${primaryColor}' },
    feedItemPinned: { background: '#1E3A8A', margin: '0 12px 10px', borderRadius: '10px', padding: '14px', borderLeft: '3px solid #60A5FA' },
    feedTag: { fontSize: '11px', fontWeight: '700', color: '${accentColor}', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTagPinned: { fontSize: '11px', fontWeight: '700', color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTitle: { fontSize: '15px', fontWeight: '600', margin: '0 0 4px', color: '#F1F5F9' },
    feedMeta: { fontSize: '12px', color: '#64748B', margin: 0 },
    feedBody: { fontSize: '13px', color: '#CBD5E1', margin: '6px 0 0', lineHeight: '1.5' },
    divider: { height: '1px', background: '#1E293B', margin: '4px 16px' },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '${secondaryColor}', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #1E40AF' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '${accentColor}', fontSize: '10px', fontWeight: '600' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('span', { style: styles.headerBadge }, '3 New')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Pinned'),
    React.createElement('div', { style: styles.feedItemPinned },
      React.createElement('p', { style: styles.feedTagPinned }, 'Important'),
      React.createElement('p', { style: styles.feedTitle }, 'Annual Meeting — Save the Date'),
      React.createElement('p', { style: styles.feedBody }, 'The Annual Owner Meeting is scheduled for next month. All residents are encouraged to attend.'),
      React.createElement('p', { style: styles.feedMeta }, 'Board of Directors · 2 days ago')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Latest Updates'),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedTag }, 'Maintenance'),
      React.createElement('p', { style: styles.feedTitle }, 'Pool Resurfacing — Complete'),
      React.createElement('p', { style: styles.feedBody }, 'The pool deck resurfacing project has been completed. The pool is now open for residents.'),
      React.createElement('p', { style: styles.feedMeta }, 'Property Management · 1 day ago')
    ),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedTag }, 'Documents'),
      React.createElement('p', { style: styles.feedTitle }, 'Q3 Financial Report Posted'),
      React.createElement('p', { style: styles.feedBody }, 'The third-quarter financial statements are now available in the document library.'),
      React.createElement('p', { style: styles.feedMeta }, 'Treasurer · 3 days ago')
    ),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedTag }, 'Reminder'),
      React.createElement('p', { style: styles.feedTitle }, 'Guest Parking Policy Update'),
      React.createElement('p', { style: styles.feedBody }, 'A reminder that guest parking is limited to 48 hours. Please register your guests at the office.'),
      React.createElement('p', { style: styles.feedMeta }, 'Management · 5 days ago')
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Bulletin')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Meetings')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Docs')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Profile')
      )
    )
  );
}`;
  },
};
