import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const hoaMobileBoardBrief: DemoTemplateDefinition = {
  id: 'hoa-mobile-board-brief',
  communityType: 'hoa_720',
  variant: 'mobile',
  name: 'Board Brief',
  tags: ['Board', 'Meetings'],
  bestFor: 'HOA boards and engaged homeowners who track meeting summaries and decisions',
  thumbnail: {
    gradient: ['#111827', '#10B981'],
    layout: 'card-grid',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#059669';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#065F46';
    const accentColor = ctx.branding?.accentColor ?? '#D1FAE5';
    const fontHeading = ctx.branding?.fontHeading ?? 'Inter, sans-serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#111827', color: '#F9FAFB', minHeight: '100vh' },
    header: { background: '#111827', padding: '18px 16px 12px', borderBottom: '1px solid #1F2937' },
    headerLabel: { fontSize: '11px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' },
    headerTitle: { margin: 0, fontSize: '20px', fontFamily: '${fontHeading}', fontWeight: '700', color: '#F9FAFB' },
    nextMeetingBanner: { background: '${secondaryColor}', margin: '12px', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    nextMeetingLeft: {},
    nextMeetingLabel: { fontSize: '11px', color: '${accentColor}', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' },
    nextMeetingTitle: { fontSize: '15px', fontWeight: '700', color: '#fff', margin: '0 0 2px' },
    nextMeetingDate: { fontSize: '12px', color: '#A7F3D0', margin: 0 },
    countdownBox: { background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' },
    countdownNum: { fontSize: '22px', fontWeight: '800', color: '#fff', display: 'block', lineHeight: 1 },
    countdownLabel: { fontSize: '10px', color: '${accentColor}' },
    sectionLabel: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280', padding: '16px 16px 10px' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 12px' },
    summaryCard: { background: '#1F2937', borderRadius: '10px', padding: '14px', border: '1px solid #374151' },
    summaryMonth: { fontSize: '11px', color: '${primaryColor}', fontWeight: '700', textTransform: 'uppercase', margin: '0 0 4px' },
    summaryTitle: { fontSize: '13px', fontWeight: '600', color: '#F9FAFB', margin: '0 0 6px' },
    summaryChip: { display: 'inline-block', background: '#374151', color: '#9CA3AF', borderRadius: '4px', padding: '2px 8px', fontSize: '11px' },
    decisionItem: { margin: '0 12px 8px', background: '#1F2937', borderRadius: '8px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start', border: '1px solid #374151' },
    decisionDot: { width: '8px', height: '8px', borderRadius: '50%', background: '${primaryColor}', flexShrink: 0, marginTop: '4px' },
    decisionText: { fontSize: '13px', color: '#E5E7EB', flex: 1, lineHeight: '1.4' },
    decisionMeta: { fontSize: '11px', color: '#4B5563', marginTop: '3px' },
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1F2937', display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #374151' },
    navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '#6B7280', fontSize: '10px', fontWeight: '600' },
    navItemActive: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: '${primaryColor}', fontSize: '10px', fontWeight: '700' },
    navIcon: { fontSize: '20px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('p', { style: styles.headerLabel }, '${communityName}'),
      React.createElement('h1', { style: styles.headerTitle }, 'Board Brief')
    ),
    React.createElement('div', { style: styles.nextMeetingBanner },
      React.createElement('div', { style: styles.nextMeetingLeft },
        React.createElement('p', { style: styles.nextMeetingLabel }, 'Next Meeting'),
        React.createElement('p', { style: styles.nextMeetingTitle }, 'Regular Board Meeting'),
        React.createElement('p', { style: styles.nextMeetingDate }, 'March 28 · 7:00 PM · Community Center')
      ),
      React.createElement('div', { style: styles.countdownBox },
        React.createElement('span', { style: styles.countdownNum }, '3'),
        React.createElement('span', { style: styles.countdownLabel }, 'days')
      )
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Recent Meeting Summaries'),
    React.createElement('div', { style: styles.grid },
      React.createElement('div', { style: styles.summaryCard },
        React.createElement('p', { style: styles.summaryMonth }, 'February 2025'),
        React.createElement('p', { style: styles.summaryTitle }, 'Regular Board Meeting'),
        React.createElement('span', { style: styles.summaryChip }, '6 items')
      ),
      React.createElement('div', { style: styles.summaryCard },
        React.createElement('p', { style: styles.summaryMonth }, 'January 2025'),
        React.createElement('p', { style: styles.summaryTitle }, 'Special Session'),
        React.createElement('span', { style: styles.summaryChip }, '3 items')
      ),
      React.createElement('div', { style: styles.summaryCard },
        React.createElement('p', { style: styles.summaryMonth }, 'December 2024'),
        React.createElement('p', { style: styles.summaryTitle }, 'Budget Meeting'),
        React.createElement('span', { style: styles.summaryChip }, '8 items')
      ),
      React.createElement('div', { style: styles.summaryCard },
        React.createElement('p', { style: styles.summaryMonth }, 'November 2024'),
        React.createElement('p', { style: styles.summaryTitle }, 'Regular Board Meeting'),
        React.createElement('span', { style: styles.summaryChip }, '5 items')
      )
    ),
    React.createElement('p', { style: styles.sectionLabel }, 'Recent Decisions'),
    React.createElement('div', { style: styles.decisionItem },
      React.createElement('div', { style: styles.decisionDot }),
      React.createElement('div', null,
        React.createElement('p', { style: styles.decisionText }, 'Approved $12,400 for irrigation system repair in common areas'),
        React.createElement('p', { style: styles.decisionMeta }, 'February meeting · Vote: 4–1')
      )
    ),
    React.createElement('div', { style: styles.decisionItem },
      React.createElement('div', { style: styles.decisionDot }),
      React.createElement('div', null,
        React.createElement('p', { style: styles.decisionText }, 'Adopted revised parking policy effective April 1, 2025'),
        React.createElement('p', { style: styles.decisionMeta }, 'January special session · Vote: 5–0')
      )
    ),
    React.createElement('div', { style: styles.decisionItem },
      React.createElement('div', { style: styles.decisionDot }),
      React.createElement('div', null,
        React.createElement('p', { style: styles.decisionText }, '2025 annual budget approved — $284,000 operating / $96,000 reserves'),
        React.createElement('p', { style: styles.decisionMeta }, 'December budget meeting · Unanimous')
      )
    ),
    React.createElement('div', { style: { height: '64px' } }),
    React.createElement('nav', { style: styles.bottomNav },
      React.createElement('div', { style: styles.navItemActive },
        React.createElement('span', null, 'Board')
      ),
      React.createElement('div', { style: styles.navItem },
        React.createElement('span', null, 'Meetings')
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
