/**
 * Static content for the email-first ("Front porch") signup. Copy is the
 * design's (`Signup Onboarding v2`, variant A); plans, prices and statutory
 * requirements are NOT restated here — they come from `SIGNUP_PLAN_OPTIONS`
 * and `getComplianceTemplate`, so this file cannot drift from them.
 */
import type { CommunityType } from '@propertypro/shared';

export interface CommunityTypeMeta {
  id: CommunityType;
  label: string;
  statute: string;
  badge: string;
  desc: string;
  /** Units/parcels at which a website becomes mandatory; 0 = never. */
  threshold: number;
  rule: string;
  noun: 'units' | 'parcels';
  intro: string;
}

export const COMMUNITY_TYPES: readonly CommunityTypeMeta[] = [
  {
    id: 'condo_718',
    label: 'Condominium',
    statute: '§718',
    badge: '§718 Condominium',
    desc: 'Florida condominium association compliance workflows.',
    threshold: 25,
    rule: '§718.111(12)(g)',
    noun: 'units',
    intro: 'Condominiums with 25 or more units must post records online under §718.111(12)(g).',
  },
  {
    id: 'hoa_720',
    label: 'HOA',
    statute: '§720',
    badge: '§720 HOA',
    desc: 'Florida HOA transparency and owner communication workflows.',
    threshold: 100,
    rule: '§720.303(4)',
    noun: 'parcels',
    intro: 'HOAs with 100 or more parcels must post records online under §720.303(4).',
  },
  {
    id: 'apartment',
    label: 'Apartment',
    statute: 'Rental',
    badge: 'Apartment community',
    desc: 'Operational tools for rentals and lease-driven communities.',
    threshold: 0,
    rule: '',
    noun: 'units',
    intro: 'Apartments are not covered by §718 or §720 — your portal focuses on day-to-day operations.',
  },
];

export function getTypeMeta(type: CommunityType): CommunityTypeMeta {
  return COMMUNITY_TYPES.find((t) => t.id === type) ?? COMMUNITY_TYPES[0]!;
}

export const APARTMENT_TOOLS: ReadonlyArray<readonly [string, string]> = [
  ['Lease tracking', 'Renewals, move-ins, and move-outs'],
  ['Package logging', 'Log deliveries and notify residents'],
  ['Visitor passes', 'Guest access at the gate'],
  ['Maintenance requests', 'Residents submit, staff track'],
  ['Announcements', 'Including emergency alerts'],
  ['Online payments', 'Rent and fees through the portal'],
];

export const REQUIREMENT_GROUP_LABELS = {
  governing_documents: 'Governing documents',
  financial_records: 'Financial records',
  meeting_records: 'Meeting records',
  insurance: 'Insurance',
  operations: 'Operations',
} as const;

/** Florida ZIPs run 32004–34997; PropertyPro Florida serves Florida only. */
export function isFloridaZip(zip: string): boolean {
  if (!/^\d{5}$/.test(zip)) return false;
  const n = Number(zip);
  return n >= 32004 && n <= 34997;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}••••@${domain}`;
}

export function isWebsiteRequired(type: CommunityType, units: number): boolean {
  const { threshold } = getTypeMeta(type);
  return threshold > 0 && units >= threshold;
}

export function formatTrialEnd(days: number, from: Date = new Date()): { long: string; short: string } {
  const end = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const sameYear = end.getFullYear() === from.getFullYear();
  return {
    long: end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    short: end.toLocaleDateString(
      'en-US',
      sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
    ),
  };
}
