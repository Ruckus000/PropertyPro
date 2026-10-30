/**
 * Plan data for the landing page's pricing section. The desktop comparison
 * table and the phone plan switcher both render from this, so the two views
 * cannot disagree about a price or a feature.
 */

/** Included in every plan, so listed once above the table instead of as rows. */
export const INCLUDED_IN_ALL = [
  'Unlimited board members',
  'Unlimited owners',
  'Statute monitoring',
  'Hosting and SSL',
  'Custom domain',
  'Audit trail export',
  'Compliance list & deadlines',
  'Meeting notices & minutes',
];

export type PlanKey = 'essentials' | 'professional' | 'manager';

export interface Plan {
  key: PlanKey;
  name: string;
  /** Monthly price without the "/mo" suffix, or a phrase for quoted plans. */
  amount: string;
  perMonth: boolean;
  forWhom: string;
  cta: { label: string; href: string; primary: boolean };
  /**
   * Not "Most popular" — that is a claim about customers we do not have yet.
   * This states where we point boards, which is true.
   */
  flag?: string;
}

export const PLANS: Plan[] = [
  {
    key: 'essentials',
    name: 'Essentials',
    amount: '$199',
    perMonth: true,
    forWhom: 'Self-managed condos and HOAs getting compliant',
    cta: {
      label: 'Start free trial',
      href: '/signup?plan=essentials&communityType=condo_718',
      primary: true,
    },
    flag: 'Where most boards start',
  },
  {
    key: 'professional',
    name: 'Professional',
    amount: '$349',
    perMonth: true,
    forWhom: 'The full single-community toolkit',
    cta: {
      label: 'Start free trial',
      href: '/signup?plan=professional&communityType=condo_718',
      primary: false,
    },
  },
  {
    key: 'manager',
    name: 'Property Manager',
    amount: "Let's talk",
    perMonth: false,
    forWhom: 'Management companies running portfolios',
    cta: { label: 'Talk to us', href: '/contact', primary: false },
  },
];

/**
 * Only the rows that DIFFER between plans. A row that reads "Included" in every
 * column compares nothing; those live in INCLUDED_IN_ALL.
 * `null` renders "Not included"; a string renders as an included value.
 */
export type ComparisonRow = { label: string } & Record<PlanKey, string | null>;

export const ROWS: ComparisonRow[] = [
  {
    label: 'Association website & owner portal',
    essentials: 'Branded',
    professional: 'Branded',
    manager: 'White-label',
  },
  {
    label: 'Mobile resident portal',
    essentials: null,
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'E-sign, maintenance & violations',
    essentials: null,
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'Portfolio roll-up & bulk posting',
    essentials: null,
    professional: null,
    manager: 'Included',
  },
  {
    label: 'Volume pricing & dedicated onboarding',
    essentials: null,
    professional: null,
    manager: 'Included',
  },
];
