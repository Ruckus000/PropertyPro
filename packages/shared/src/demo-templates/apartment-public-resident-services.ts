import type { DemoTemplateDefinition, DemoTemplateRenderContext } from './types';

export const apartmentPublicResidentServices: DemoTemplateDefinition = {
  id: 'apartment-public-resident-services',
  communityType: 'apartment',
  variant: 'public',
  name: 'Resident Services',
  tags: ['Services', 'Resident-friendly'],
  bestFor: 'Apartment communities that lead with resident services and move-in experience',
  thumbnail: {
    gradient: ['#7C3AED', '#A78BFA'],
    layout: 'hero-centered',
  },
  build(ctx: DemoTemplateRenderContext) {
    const primaryColor = ctx.branding?.primaryColor ?? '#7C3AED';
    const secondaryColor = ctx.branding?.secondaryColor ?? '#6D28D9';
    const accentColor = ctx.branding?.accentColor ?? '#EDE9FE';
    const fontHeading = ctx.branding?.fontHeading ?? 'Georgia, serif';
    const fontBody = ctx.branding?.fontBody ?? 'Inter, sans-serif';
    const communityName = ctx.communityName;

    return `function App() {
  var styles = {
    root: { fontFamily: '${fontBody}', margin: 0, padding: 0, background: '#FAFAFA', color: '#1C1917' },
    header: { background: '${primaryColor}', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { margin: 0, fontSize: '19px', fontFamily: '${fontHeading}', fontWeight: '700' },
    headerNav: { display: 'flex', gap: '18px' },
    navLink: { color: '${accentColor}', textDecoration: 'none', fontSize: '13px', fontWeight: '500' },
    hero: { background: 'linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 60%, #A78BFA 100%)', color: '#fff', padding: '56px 24px', textAlign: 'center' },
    heroTitle: { fontSize: '34px', fontFamily: '${fontHeading}', margin: '0 0 14px', fontWeight: '700' },
    heroSubtitle: { fontSize: '17px', opacity: '0.9', margin: '0 0 28px', lineHeight: '1.6' },
    heroCtaRow: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' },
    ctaPrimary: { background: '#fff', color: '${primaryColor}', padding: '12px 24px', borderRadius: '8px', fontWeight: '700', fontSize: '15px', textDecoration: 'none' },
    ctaSecondary: { background: 'transparent', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', fontSize: '15px', border: '2px solid rgba(255,255,255,0.6)', textDecoration: 'none' },
    servicesSection: { padding: '48px 24px', maxWidth: '880px', margin: '0 auto' },
    servicesSectionTitle: { fontSize: '22px', fontFamily: '${fontHeading}', fontWeight: '700', color: '${secondaryColor}', textAlign: 'center', margin: '0 0 8px' },
    servicesSectionSub: { fontSize: '14px', color: '#6B7280', textAlign: 'center', margin: '0 0 32px' },
    serviceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' },
    serviceCard: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px 18px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
    serviceCardTop: { background: '${accentColor}', borderRadius: '12px', padding: '24px 18px', textAlign: 'center', border: '1px solid #C4B5FD' },
    serviceIcon: { fontSize: '32px', marginBottom: '10px' },
    serviceTitle: { fontSize: '15px', fontWeight: '700', color: '${secondaryColor}', margin: '0 0 6px' },
    serviceDesc: { fontSize: '13px', color: '#6B7280', margin: 0, lineHeight: '1.5' },
    promoStrip: { background: '${primaryColor}', color: '#fff', padding: '32px 24px', textAlign: 'center' },
    promoTitle: { fontSize: '20px', fontFamily: '${fontHeading}', margin: '0 0 8px', fontWeight: '700' },
    promoSub: { fontSize: '14px', opacity: '0.85', margin: '0 0 18px' },
    promoBtn: { background: '#fff', color: '${primaryColor}', padding: '10px 24px', borderRadius: '6px', fontWeight: '700', fontSize: '14px', display: 'inline-block', textDecoration: 'none' },
    footer: { background: '${secondaryColor}', color: '${accentColor}', textAlign: 'center', padding: '14px', fontSize: '12px' },
  };

  return React.createElement('div', { style: styles.root },
    React.createElement('header', { style: styles.header },
      React.createElement('h1', { style: styles.headerTitle }, '${communityName}'),
      React.createElement('nav', { style: styles.headerNav },
        React.createElement('a', { href: '#', style: styles.navLink }, 'Services'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Amenities'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Apply'),
        React.createElement('a', { href: '#', style: styles.navLink }, 'Contact')
      )
    ),
    React.createElement('section', { style: styles.hero },
      React.createElement('h2', { style: styles.heroTitle }, 'Life Made Easier at ${communityName}'),
      React.createElement('p', { style: styles.heroSubtitle }, 'From move-in to maintenance, we\\'ve got everything covered for modern apartment living.'),
      React.createElement('div', { style: styles.heroCtaRow },
        React.createElement('a', { href: '#', style: styles.ctaPrimary }, 'Resident Portal'),
        React.createElement('a', { href: '#', style: styles.ctaSecondary }, 'Submit a Request')
      )
    ),
    React.createElement('section', { style: styles.servicesSection },
      React.createElement('h3', { style: styles.servicesSectionTitle }, 'Everything You Need'),
      React.createElement('p', { style: styles.servicesSectionSub }, 'Full-service living — all managed through your resident portal'),
      React.createElement('div', { style: styles.serviceGrid },
        React.createElement('div', { style: styles.serviceCardTop },
          React.createElement('p', { style: styles.serviceTitle }, 'Maintenance'),
          React.createElement('p', { style: styles.serviceDesc }, 'Submit and track work orders online. Fast response guaranteed.')
        ),
        React.createElement('div', { style: styles.serviceCard },
          React.createElement('p', { style: styles.serviceTitle }, 'Package Tracking'),
          React.createElement('p', { style: styles.serviceDesc }, 'Get notified when packages arrive at the mail room.')
        ),
        React.createElement('div', { style: styles.serviceCard },
          React.createElement('p', { style: styles.serviceTitle }, 'Parking'),
          React.createElement('p', { style: styles.serviceDesc }, 'Manage your vehicle registration and guest passes.')
        ),
        React.createElement('div', { style: styles.serviceCard },
          React.createElement('p', { style: styles.serviceTitle }, 'Amenities'),
          React.createElement('p', { style: styles.serviceDesc }, 'Reserve the gym, pool, and community spaces online.')
        ),
        React.createElement('div', { style: styles.serviceCard },
          React.createElement('p', { style: styles.serviceTitle }, 'Lease Portal'),
          React.createElement('p', { style: styles.serviceDesc }, 'View your lease, renewal options, and documents anytime.')
        ),
        React.createElement('div', { style: styles.serviceCard },
          React.createElement('p', { style: styles.serviceTitle }, 'Contact Office'),
          React.createElement('p', { style: styles.serviceDesc }, 'Message management directly — quick response times.')
        )
      )
    ),
    React.createElement('div', { style: styles.promoStrip },
      React.createElement('p', { style: styles.promoTitle }, 'New to ${communityName}?'),
      React.createElement('p', { style: styles.promoSub }, 'Set up your resident portal in minutes and unlock all services.'),
      React.createElement('a', { href: '#', style: styles.promoBtn }, 'Get Started')
    ),
    React.createElement('footer', { style: styles.footer },
      '© ${communityName}. Powered by PropertyPro Florida.'
    )
  );
}`;
  },
};
