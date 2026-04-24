/**
 * From reference `a34fd003-shared-wizard.js` (STEPS_4, COMMUNITY_TYPES, PLANS).
 * Plan bullets kept verbatim from reference PLANS.
 */
import type { SignupPlanId } from '@/lib/auth/signup-schema';

export const STEPS_4 = [
  { id: 'account' as const, title: 'Your account', sub: 'Who\u2019s setting this up' },
  { id: 'community' as const, title: 'Community', sub: 'Name, type, location' },
  { id: 'plan' as const, title: 'Plan', sub: 'Pick what fits' },
  { id: 'finish' as const, title: 'Finish up', sub: 'Subdomain & terms' },
] as const;

export type StepId = (typeof STEPS_4)[number]['id'];

export const COMMUNITY_TYPES = [
  { id: 'condo' as const, label: 'Condominium', statute: '§718', desc: 'Florida condo association compliance workflows.' },
  { id: 'hoa' as const, label: 'HOA', statute: '§720', desc: 'HOA transparency and owner communication.' },
  { id: 'apt' as const, label: 'Apartment', statute: 'Op.', desc: 'Operational tools for rentals and leases.' },
] as const;

export type CommunityTypeKey = (typeof COMMUNITY_TYPES)[number]['id'];

export interface RefPlan {
  id: SignupPlanId;
  name: string;
  price: number;
  blurb: string;
  bullets: readonly string[];
  recommended?: boolean;
}

/** Reference PLANS (Essentials / Professional) — used for condo + HOA. Apartment uses schema-driven plans. */
export const REFERENCE_PLANS_CONDO_HOA: readonly RefPlan[] = [
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
] as const;

/** `df32307b-clean-wizard.js` uses `{ tight: 12, regular: 18, airy: 24 }` for the CleanWizard spacing map. */
export function spacePx(
  tok: 'tight' | 'regular' | 'airy',
  map: { tight: number; regular: number; airy: number } = { tight: 12, regular: 18, airy: 24 },
): number {
  return map[tok] ?? map.regular;
}
