import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const apartmentMobileServiceSnapshot: DemoTemplateDefinition = {
  id: 'apartment-mobile-service-snapshot',
  communityType: 'apartment',
  variant: 'mobile',
  name: 'Service Snapshot',
  tags: ['Services', 'Quick-access'],
  bestFor: 'Apartment residents who want one-tap access to service requests from their phone',
  thumbnail: {
    gradient: ['#111827', '#A78BFA'],
    layout: 'card-grid',
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
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#111827', color: '#F9FAFB', minHeight: '100vh' },
    header: { background: '#111827', padding: '18px 16px 10px', borderBottom: '1px solid #1F2937' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerTitle: { margin: 0, fontSize: '20px', fontFamily: '${fontHeading}', fontWeight: '700', color: '#F9FAFB' },
    headerSub: { fontSize: '12px', color: '#6B7280', margin: '2px 0 0' },
    headerBadge: { background: '${primaryColor}', color: '#fff', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: '700' },
    activeWidget: { background: '#1F2937', margin: '12px', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'center', border: '1px solid #374151' },
    activeWidgetIcon: { fontSize: '24px' },
    activeWidgetBody: { flex: 1 },
    activeWidgetTitle: { fontSize: '13px', fontWeight: '600', color: '#F9FAFB', margin: '0 0 2px' },
    activeWidgetSub: { fontSize: '11px', color: '#6B7280', margin: 0 },
    activeWidgetStatus: { background: '#FEF3C7', color: '#92400E', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: '600' },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280', padding: '14px 16px 10px' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 12px' },
    serviceCard: { background: '#1F2937', borderRadius: '12px', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #374151', cursor: 'pointer' },
    serviceCardHighlight: { background: '${secondaryColor}', borderRadius: '12px', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid ${primaryColor}', cursor: 'pointer' },
    serviceIconWrap: { width: '38px', height: '38px', borderRadius: '10px', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
    serviceIconWrapHL: { width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
    serviceLabel: { fontSize: '13px', fontWeight: '600', color: '#F9FAFB', margin: '0 0 2px' },
    serviceSub: { fontSize: '11px', color: '#6B7280', margin: 0 },
    serviceSubHL: { fontSize: '11px', color: '#C4B5FD', margin: 0 },
    historyItem: { margin: '0 12px 8px', background: '#1F2937', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #374151' },
    historyLeft: {},
    historyTitle: { fontSize: '13px', fontWeight: '600', color: '#F9FAFB', margin: '0 0 2px' },
    historyMeta: { fontSize: '11px', color: '#4B5563', margin: 0 },
    historyChip: { background: '#D1FAE5', color: '#065F46', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1F2937', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #374151' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#4B5563', fontSize: '10px', fontWeight: '600' },
    navItemActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#A78BFA', fontSize: '10px', fontWeight: '700' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('div', { style: styles.headerTop },
        React.createElement('div', null,
          React.createElement('h1', { style: styles.headerTitle }, 'Services'),
          React.createElement('p', { style: styles.headerSub }, '${communityName} · Unit 204')
        ),
        React.createElement('span', { style: styles.headerBadge }, '1 Active')
      )
    ),
    React.createElement('div', { style: styles.activeWidget },
      React.createElement('span', { style: styles.activeWidgetIcon }, '❄️'),
      React.createElement('div', { style: styles.activeWidgetBody },
        React.createElement('p', { style: styles.activeWidgetTitle }, 'AC not cooling — Open Ticket'),
        React.createElement('p', { style: styles.activeWidgetSub }, 'Technician visit: Thu 10am–2pm')
      ),
      React.createElement('span', { style: styles.activeWidgetStatus }, 'Scheduled')
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Request a Service'),
    React.createElement('div', { style: styles.grid },
      React.createElement('div', { style: styles.serviceCardHighlight },
        React.createElement('div', { style: styles.serviceIconWrapHL }, '🔧'),
        React.createElement('p', { style: styles.serviceLabel }, 'Maintenance'),
        React.createElement('p', { style: styles.serviceSubHL }, 'Repairs & fixes')
      ),
      React.createElement('div', { style: styles.serviceCard },
        React.createElement('div', { style: styles.serviceIconWrap }, '🐛'),
        React.createElement('p', { style: styles.serviceLabel }, 'Pest Control'),
        React.createElement('p', { style: styles.serviceSub }, 'Schedule inspection')
      ),
      React.createElement('div', { style: styles.serviceCard },
        React.createElement('div', { style: styles.serviceIconWrap }, '🔑'),
        React.createElement('p', { style: styles.serviceLabel }, 'Locksmith'),
        React.createElement('p', { style: styles.serviceSub }, 'Key & lock help')
      ),
      React.createElement('div', { style: styles.serviceCard },
        React.createElement('div', { style: styles.serviceIconWrap }, '📦'),
        React.createElement('p', { style: styles.serviceLabel }, 'Move Services'),
        React.createElement('p', { style: styles.serviceSub }, 'Elevator & dock booking')
      )
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Recent History'),
    React.createElement('div', { style: styles.historyItem },
      React.createElement('div', { style: styles.historyLeft },
        React.createElement('p', { style: styles.historyTitle }, 'Bathroom faucet dripping'),
        React.createElement('p', { style: styles.historyMeta }, 'Mar 20 · Plumbing')
      ),
      React.createElement('span', { style: styles.historyChip }, 'Done')
    ),
    React.createElement('div', { style: styles.historyItem },
      React.createElement('div', { style: styles.historyLeft },
        React.createElement('p', { style: styles.historyTitle }, 'Dishwasher not draining'),
        React.createElement('p', { style: styles.historyMeta }, 'Feb 14 · Appliances')
      ),
      React.createElement('span', { style: styles.historyChip }, 'Done')
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', { style: styles.navIcon }, '🏠'),
        React.createElement('span', null, 'Home')
      ),
      React.createElement('div', { style: styles.navItemActive },
        React.createElement('span', { style: styles.navIcon }, '🔧'),
        React.createElement('span', null, 'Services')
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
