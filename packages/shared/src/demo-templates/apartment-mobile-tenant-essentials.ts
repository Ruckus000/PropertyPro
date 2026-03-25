import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const apartmentMobileTenantEssentials: DemoTemplateDefinition = {
  id: 'apartment-mobile-tenant-essentials',
  communityType: 'apartment',
  variant: 'mobile',
  name: 'Tenant Essentials',
  tags: ['Lease', 'Maintenance'],
  bestFor: 'Tenants who want quick mobile access to lease details and maintenance requests',
  thumbnail: {
    gradient: ['#7C3AED', '#111827'],
    layout: 'feed-list',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#7C3AED';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#6D28D9';
    const accentColor = ctx.branding?.accentColor ?? '#EDE9FE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Inter, sans-serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#0D0A14', color: '#F5F3FF', minHeight: '100vh' },
    header: { background: '${secondaryColor}', color: '#fff', padding: '16px 16px 12px' },
    headerSub: { fontSize: '11px', color: '#C4B5FD', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' },
    headerTitle: { margin: 0, fontSize: '18px', fontFamily: '${fontHeading}', fontWeight: '700' },
    leaseBanner: { background: '#1A0D2E', margin: '12px', borderRadius: '10px', padding: '14px 16px', border: '1px solid ${primaryColor}' },
    leaseLabel: { fontSize: '11px', color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' },
    leaseRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
    leaseKey: { fontSize: '13px', color: '#9CA3AF' },
    leaseVal: { fontSize: '13px', fontWeight: '600', color: '#F5F3FF' },
    renewBadge: { background: '#7C3AED', color: '#fff', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', display: 'inline-block', marginTop: '8px' },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280', padding: '14px 16px 8px' },
    feedItem: { margin: '0 12px 10px', background: '#160E26', borderRadius: '10px', padding: '14px', border: '1px solid #2D1F47' },
    feedItemUrgent: { margin: '0 12px 10px', background: '#1A0D2E', borderRadius: '10px', padding: '14px', border: '1px solid ${primaryColor}' },
    feedType: { fontSize: '11px', fontWeight: '700', color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTypeUrgent: { fontSize: '11px', fontWeight: '700', color: '#C084FC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
    feedTitle: { fontSize: '14px', fontWeight: '600', color: '#F5F3FF', margin: '0 0 3px' },
    feedBody: { fontSize: '12px', color: '#9CA3AF', lineHeight: '1.5', margin: '0 0 6px' },
    feedStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    feedMeta: { fontSize: '11px', color: '#4B5563' },
    statusChip: { background: '#FEF3C7', color: '#92400E', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' },
    statusChipDone: { background: '#D1FAE5', color: '#065F46', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' },
    quickBar: { display: 'flex', gap: '8px', padding: '0 12px 4px', overflowX: 'auto' },
    quickBtn: { background: '${primaryColor}', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: '700', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 },
    quickBtnGhost: { background: '#1F1A2E', color: '#A78BFA', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: '600', border: '1px solid #2D1F47', whiteSpace: 'nowrap', flexShrink: 0 },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#160E26', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #2D1F47' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#4B5563', fontSize: '10px', fontWeight: '600' },
    navItemActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#A78BFA', fontSize: '10px', fontWeight: '700' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('p', { style: styles.headerSub }, '${communityName}'),
      React.createElement('h1', { style: styles.headerTitle }, 'Tenant Essentials')
    ),
    React.createElement('div', { style: styles.leaseBanner },
      React.createElement('p', { style: styles.leaseLabel }, 'Your Lease'),
      React.createElement('div', { style: styles.leaseRow },
        React.createElement('span', { style: styles.leaseKey }, 'Unit'),
        React.createElement('span', { style: styles.leaseVal }, '204')
      ),
      React.createElement('div', { style: styles.leaseRow },
        React.createElement('span', { style: styles.leaseKey }, 'Lease End'),
        React.createElement('span', { style: styles.leaseVal }, 'July 31, 2025')
      ),
      React.createElement('div', { style: styles.leaseRow },
        React.createElement('span', { style: styles.leaseKey }, 'Monthly Rent'),
        React.createElement('span', { style: styles.leaseVal }, '$1,650')
      ),
      React.createElement('span', { style: styles.renewBadge }, 'Renewal Available')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Quick Actions'),
    React.createElement('div', { style: styles.quickBar },
      React.createElement('button', { style: styles.quickBtn }, '+ New Request'),
      React.createElement('button', { style: styles.quickBtnGhost }, 'Pay Rent'),
      React.createElement('button', { style: styles.quickBtnGhost }, 'View Lease'),
      React.createElement('button', { style: styles.quickBtnGhost }, 'Contact Office')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Active Requests'),
    React.createElement('div', { style: styles.feedItemUrgent },
      React.createElement('p', { style: styles.feedTypeUrgent }, '❄️ HVAC'),
      React.createElement('p', { style: styles.feedTitle }, 'AC not cooling properly'),
      React.createElement('p', { style: styles.feedBody }, 'Technician scheduled for Thursday between 10am–2pm.'),
      React.createElement('div', { style: styles.feedStatusRow },
        React.createElement('span', { style: styles.feedMeta }, 'Submitted 1 day ago'),
        React.createElement('span', { style: styles.statusChip }, 'Scheduled')
      )
    ),
    React.createElement('div', { style: styles.feedItem },
      React.createElement('p', { style: styles.feedType }, '🚰 Plumbing'),
      React.createElement('p', { style: styles.feedTitle }, 'Bathroom faucet dripping'),
      React.createElement('p', { style: styles.feedBody }, 'Work order completed. Washer replaced.'),
      React.createElement('div', { style: styles.feedStatusRow },
        React.createElement('span', { style: styles.feedMeta }, 'Resolved 3 days ago'),
        React.createElement('span', { style: styles.statusChipDone }, 'Completed')
      )
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItemActive },
        React.createElement('span', { style: styles.navIcon }, '🏠'),
        React.createElement('span', null, 'Home')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', { style: styles.navIcon }, '🔧'),
        React.createElement('span', null, 'Requests')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', { style: styles.navIcon }, '📄'),
        React.createElement('span', null, 'Lease')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', { style: styles.navIcon }, '👤'),
        React.createElement('span', null, 'Account')
      )
    )
  );
}`;
  },
};
