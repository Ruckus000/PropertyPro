export const DEMO_COMMUNITIES = [
  {
    name: 'Sunset Condos',
    slug: 'sunset-condos',
    communityType: 'condo_718',
    timezone: 'America/New_York',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    addressLine1: '123 Sunset Blvd',
  },
  {
    name: 'Palm Shores HOA',
    slug: 'palm-shores-hoa',
    communityType: 'hoa_720',
    timezone: 'America/New_York',
    city: 'Fort Lauderdale',
    state: 'FL',
    zipCode: '33301',
    addressLine1: '500 Palm Shores Dr',
  },
  {
    name: 'Bay View Apartments',
    slug: 'bay-view-apartments',
    communityType: 'apartment',
    timezone: 'America/Chicago',
    city: 'Pensacola',
    state: 'FL',
    zipCode: '32501',
    addressLine1: '88 Bay View Way',
  },
] as const;

export const DEMO_USERS = [
  { email: 'board.president@sunset.local', fullName: 'Sam President', phone: '305-555-0101' },
  { email: 'board.member@sunset.local', fullName: 'Bianca Board', phone: '305-555-0102' },
  { email: 'owner.one@sunset.local', fullName: 'Olivia Owner', phone: '305-555-0103' },
  { email: 'tenant.one@sunset.local', fullName: 'Tyler Tenant', phone: '305-555-0104' },
  { email: 'cam.one@sunset.local', fullName: 'Cameron CAM', phone: '305-555-0105' },
  { email: 'pm.admin@sunset.local', fullName: 'Pat PM', phone: '305-555-0106' },
  { email: 'site.manager@bayview.local', fullName: 'Sierra Site', phone: '850-555-0107' },
] as const;
