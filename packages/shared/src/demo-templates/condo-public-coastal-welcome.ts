import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const condoPublicCoastalWelcome: DemoTemplateDefinition = {
  id: 'condo-public-coastal-welcome',
  communityType: 'condo_718',
  variant: 'public',
  name: 'Coastal Welcome',
  tags: ['Warm', 'Resident-friendly'],
  bestFor: 'Communities that prioritize a welcoming, friendly resident experience',
  thumbnail: {
    gradient: ['#0D4F6E', '#06B6D4'],
    layout: 'hero-centered',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#0D4F6E';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#0891B2';
    const accentColor = ctx.branding?.accentColor ?? '#CFFAFE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#F0F9FF', color: '#0C4A6E' },
    header: { background: '${primaryColor}', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '20px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerNav: { display: 'flex', gap: '20px' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '14px', fontWeight: '500' },
    hero: { background: 'linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)', color: '#fff', padding: '64px 24px', textAlign: 'center' },
    heroTitle: { fontSize: '36px', fontFamily: '${fontHeading}', margin: '0 0 16px', fontWeight: '700' },
    heroSubtitle: { fontSize: '18px', opacity: '0.9', margin: '0 0 28px', lineHeight: '1.6' },
    heroCta: { background: '#fff', color: '${primaryColor}', padding: '12px 28px', borderRadius: '8px', fontWeight: '700', fontSize: '15px', display: 'inline-block', textDecoration: 'none' },
    welcomeSection: { padding: '40px 24px', maxWidth: '760px', margin: '0 auto', textAlign: 'center' },
    welcomeTitle: { fontSize: '22px', fontFamily: '${fontHeading}', color: '${primaryColor}', margin: '0 0 12px', fontWeight: '700' },
    welcomeText: { fontSize: '15px', lineHeight: '1.7', color: '#334155', margin: '0 0 32px' },
    cardRow: { display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' },
    card: { background: '#fff', border: '1px solid #BAE6FD', borderRadius: '12px', padding: '24px 20px', flex: '1', minWidth: '180px', maxWidth: '220px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    cardIcon: { fontSize: '28px', marginBottom: '10px' },
    cardTitle: { fontSize: '15px', fontWeight: '700', color: '${primaryColor}', margin: '0 0 6px' },
    cardDesc: { fontSize: '13px', color: '#64748B', margin: 0, lineHeight: '1.5' },
    contactSection: { background: '${secondaryColor}', color: '#fff', padding: '32px 24px', textAlign: 'center' },
    contactTitle: { fontSize: '18px', fontFamily: '${fontHeading}', margin: '0 0 8px', fontWeight: '700' },
    contactText: { fontSize: '14px', opacity: '0.9', margin: 0 },
    footer: { background: '${primaryColor}', color: '${accentColor}', textAlign: 'center', padding: '14px', fontSize: '12px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('nav', { style: styles.headerNav },
        React.createElement('a', { href: '#', style: styles.navLink }, 'Residents'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Amenities'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('section', { style: styles.hero },
      React.createElement('h2', { style: styles.heroTitle }, 'Welcome Home to ${communityName}'),
      React.createElement('p', { style: styles.heroSubtitle }, 'A warm, vibrant community where neighbors become friends.'),
      React.createElement('a', { href: '#', style: styles.heroCta }, 'Explore Our Community')
    ),
    React.createElement('section', { style: styles.welcomeSection },
      React.createElement('h3', { style: styles.welcomeTitle }, 'Your Community, Your Home'),
      React.createElement('p', { style: styles.welcomeText }, 'At ${communityName}, we believe great communities are built on connection, care, and communication. Discover everything your home has to offer.'),
      React.createElement('div', { style: styles.cardRow },
        React.createElement('div', { style: styles.card },
          React.createElement('p', { style: styles.cardTitle }, 'Amenities'),
          React.createElement('p', { style: styles.cardDesc }, 'Pool, gym, and common spaces for every resident.')
        ),
        React.createElement('div', { style: styles.card },
          React.createElement('p', { style: styles.cardTitle }, 'Resources'),
          React.createElement('p', { style: styles.cardDesc }, 'Rules, forms, and documents at your fingertips.')
        ),
        React.createElement('div', { style: styles.card },
          React.createElement('p', { style: styles.cardTitle }, 'Events'),
          React.createElement('p', { style: styles.cardDesc }, 'Community gatherings and board meeting schedules.')
        ),
        React.createElement('div', { style: styles.card },
          React.createElement('p', { style: styles.cardTitle }, 'Connect'),
          React.createElement('p', { style: styles.cardDesc }, 'Reach property management and your board easily.')
        )
      )
    ),
    React.createElement('section', { style: styles.contactSection },
      React.createElement('h3', { style: styles.contactTitle }, 'We\\'re Here to Help'),
      React.createElement('p', { style: styles.contactText }, 'Questions about your home or community? Reach out to the management office anytime.')
    ),
    React.createElement('footer', { style: styles.footer },
      '© ${communityName}. Powered by PropertyPro Florida.'
    )
  );
}`;
  },
};
