// Shared state, step config, and primitives used by all three wizard variations.

const STEPS_5 = [
  { id: 'account', title: 'Your account',    sub: 'Who\u2019s setting this up' },
  { id: 'community', title: 'Your community', sub: 'Name and type' },
  { id: 'address', title: 'Location',         sub: 'Where the community is' },
  { id: 'plan',    title: 'Plan',             sub: 'Pick what fits' },
  { id: 'finish',  title: 'Finish up',        sub: 'Subdomain & terms' },
];

const STEPS_4 = [
  { id: 'account',   title: 'Your account',    sub: 'Who\u2019s setting this up' },
  { id: 'community', title: 'Community',       sub: 'Name, type, location' },
  { id: 'plan',      title: 'Plan',            sub: 'Pick what fits' },
  { id: 'finish',    title: 'Finish up',       sub: 'Subdomain & terms' },
];

const STEPS_3 = [
  { id: 'account',   title: 'Account & community', sub: 'About you and the association' },
  { id: 'plan',      title: 'Plan & type',         sub: 'How you\u2019ll use PropertyPro' },
  { id: 'finish',    title: 'Finish up',           sub: 'Subdomain & terms' },
];

function getSteps(count) {
  if (count === '3' || count === 3) return STEPS_3;
  if (count === '5' || count === 5) return STEPS_5;
  return STEPS_4;
}

const COMMUNITY_TYPES = [
  { id: 'condo', label: 'Condominium', statute: '§718',  desc: 'Florida condo association compliance workflows.' },
  { id: 'hoa',   label: 'HOA',         statute: '§720',  desc: 'HOA transparency and owner communication.' },
  { id: 'apt',   label: 'Apartment',   statute: 'Op.',   desc: 'Operational tools for rentals and leases.' },
];

const PLANS = [
  {
    id: 'essentials',
    name: 'Essentials',
    price: 199,
    blurb: 'Website, statutory document posting, owner portal, and announcements.',
    bullets: ['Custom subdomain', 'Document hosting', 'Owner portal', 'Compliance dashboard'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 349,
    blurb: 'Full platform with e-sign, violations, ARC, finance, and more.',
    bullets: ['Everything in Essentials', 'E-sign workflows', 'Violations + ARC', 'Finance & reporting'],
    recommended: true,
  },
];

const ROLES = [
  { id: 'board',   label: 'Board member',        desc: 'President, Treasurer, Secretary, Director' },
  { id: 'manager', label: 'Property manager',    desc: 'Licensed CAM or management company staff' },
  { id: 'owner',   label: 'Unit owner',          desc: 'Setting this up on behalf of the board' },
  { id: 'other',   label: 'Something else',      desc: 'Developer, attorney, or third party' },
];

// --- Shared form state hook ---------------------------------------------------

function useSignupState() {
  const [data, setData] = React.useState({
    firstName: '', lastName: '', email: '', role: '',
    password: '', confirmPassword: '',
    community: '', street: '', city: '', state: 'FL', zip: '', county: '',
    units: 48,
    type: 'condo',
    plan: 'professional',
    billing: 'monthly',
    subdomain: '',
    agree: false,
  });
  const update = (key, val) => setData((d) => ({ ...d, [key]: val }));

  // Auto-suggest subdomain from community name
  React.useEffect(() => {
    if (!data.community) return;
    const slug = data.community.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
    setData((d) => (d.subdomain && d.subdomain !== slug && d._sdTouched ? d : { ...d, subdomain: slug }));
  }, [data.community]);

  return [data, update, setData];
}

// --- Shared stepping logic ----------------------------------------------------

function useWizard(steps) {
  const [idx, setIdx] = React.useState(0);
  const clamp = (n) => Math.max(0, Math.min(steps.length - 1, n));
  const next = () => setIdx((i) => clamp(i + 1));
  const prev = () => setIdx((i) => clamp(i - 1));
  const go = (i) => setIdx(clamp(i));
  React.useEffect(() => { if (idx >= steps.length) setIdx(steps.length - 1); }, [steps.length]);
  return { idx: Math.min(idx, steps.length - 1), step: steps[Math.min(idx, steps.length - 1)], next, prev, go, total: steps.length };
}

// --- Spacing helper -----------------------------------------------------------

function spacePx(tok, map) {
  const m = map || { tight: 12, regular: 18, airy: 28 };
  return m[tok] ?? m.regular;
}

// --- Export -------------------------------------------------------------------

Object.assign(window, {
  getSteps, COMMUNITY_TYPES, PLANS, ROLES,
  useSignupState, useWizard, spacePx,
});
