import type { CommunityType } from '@propertypro/shared';
import { z } from 'zod';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export interface SignupPlanOption {
  id: SignupPlanId;
  label: string;
  monthlyPriceUsd: number;
  description: string;
}

export const SIGNUP_PLAN_IDS = [
  'compliance_basic',
  'compliance_plus_mobile',
  'full_platform',
  'apartment_operations',
] as const;

export type SignupPlanId = (typeof SIGNUP_PLAN_IDS)[number];

export const SIGNUP_PLAN_OPTIONS: Record<CommunityType, readonly SignupPlanOption[]> = {
  condo_718: [
    {
      id: 'compliance_basic',
      label: 'Compliance Basic',
      monthlyPriceUsd: 99,
      description: 'Website, statutory document posting, and owner portal.',
    },
    {
      id: 'compliance_plus_mobile',
      label: 'Compliance + Mobile',
      monthlyPriceUsd: 199,
      description: 'Adds resident mobile app and push announcements.',
    },
    {
      id: 'full_platform',
      label: 'Full Platform',
      monthlyPriceUsd: 349,
      description: 'Includes advanced operations and reporting workflows.',
    },
  ],
  hoa_720: [
    {
      id: 'compliance_basic',
      label: 'Compliance Basic',
      monthlyPriceUsd: 99,
      description: 'Website, statutory document posting, and owner portal.',
    },
    {
      id: 'compliance_plus_mobile',
      label: 'Compliance + Mobile',
      monthlyPriceUsd: 199,
      description: 'Adds resident mobile app and push announcements.',
    },
    {
      id: 'full_platform',
      label: 'Full Platform',
      monthlyPriceUsd: 349,
      description: 'Includes advanced operations and reporting workflows.',
    },
  ],
  apartment: [
    {
      id: 'full_platform',
      label: 'Full Platform',
      monthlyPriceUsd: 349,
      description: 'Core apartment operations with compliance-ready records.',
    },
    {
      id: 'apartment_operations',
      label: 'Apartment Operations',
      monthlyPriceUsd: 499,
      description: 'Adds lease workflows, bulk resident import, and analytics.',
    },
  ],
};

export function normalizeSignupSubdomain(rawValue: string): string {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

export function suggestSubdomainFromCommunityName(communityName: string): string {
  return normalizeSignupSubdomain(communityName);
}

export function getSignupPlansForCommunityType(
  communityType: CommunityType,
): readonly SignupPlanOption[] {
  return SIGNUP_PLAN_OPTIONS[communityType];
}

export function isPlanAvailableForCommunityType(
  communityType: CommunityType,
  planKey: string,
): planKey is SignupPlanId {
  return SIGNUP_PLAN_OPTIONS[communityType].some((plan) => plan.id === planKey);
}

export const signupSubdomainSchema = z.object({
  subdomain: z.string().trim().min(1, 'Subdomain is required'),
  signupRequestId: z.string().trim().min(1).optional(),
});

export const signupSchema = z
  .object({
    signupRequestId: z.string().uuid().optional(),
    primaryContactName: z
      .string()
      .trim()
      .min(2, 'Primary contact name is required')
      .max(120, 'Primary contact name must be at most 120 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters')
      .regex(/[a-z]/, 'Password must include a lowercase letter')
      .regex(/[A-Z]/, 'Password must include an uppercase letter')
      .regex(/\d/, 'Password must include a number')
      .regex(/[^A-Za-z0-9]/, 'Password must include a special character'),
    communityName: z
      .string()
      .trim()
      .min(2, 'Community name is required')
      .max(160, 'Community name must be at most 160 characters'),
    address: z
      .string()
      .trim()
      .min(5, 'Address is required')
      .max(240, 'Address must be at most 240 characters'),
    county: z
      .string()
      .trim()
      .min(2, 'County is required')
      .max(120, 'County must be at most 120 characters'),
    unitCount: z.coerce
      .number()
      .int('Unit count must be a whole number')
      .min(1, 'Unit count must be at least 1')
      .max(20000, 'Unit count is too large'),
    communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
    planKey: z.enum(SIGNUP_PLAN_IDS),
    candidateSlug: z
      .string()
      .trim()
      .min(1, 'Subdomain is required')
      .transform((value) => normalizeSignupSubdomain(value))
      .refine((value) => value.length >= 3, {
        message: 'Subdomain must be at least 3 characters',
      })
      .refine((value) => value.length <= 63, {
        message: 'Subdomain must be at most 63 characters',
      })
      .refine((value) => SUBDOMAIN_PATTERN.test(value), {
        message: 'Subdomain may only include lowercase letters, numbers, and hyphens',
      }),
    termsAccepted: z
      .boolean()
      .refine((value) => value, {
        message: 'You must accept the Terms of Service to continue',
      }),
  })
  .superRefine((value, ctx) => {
    if (!isPlanAvailableForCommunityType(value.communityType, value.planKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selected plan is not available for this community type',
        path: ['planKey'],
      });
    }
  });

export type SignupInput = z.infer<typeof signupSchema>;
