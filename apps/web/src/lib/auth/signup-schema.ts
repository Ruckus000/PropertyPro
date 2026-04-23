import type { CommunityType } from '@propertypro/shared';
import { PLAN_IDS, buildPasswordZodSchema, type PlanId } from '@propertypro/shared';
import { z } from 'zod';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const STATE_PATTERN = /^[A-Za-z]{2}$/;
const ZIP_CODE_PATTERN = /^\d{5}(?:-\d{4})?$/;

export interface SignupPlanOption {
  id: SignupPlanId;
  label: string;
  monthlyPriceUsd: number;
  description: string;
}

/**
 * @deprecated Use PLAN_IDS from @propertypro/shared instead.
 * Kept for backward compatibility with existing signup form references.
 */
export const SIGNUP_PLAN_IDS = PLAN_IDS;

/** Alias of PlanId — kept for backward compatibility. */
export type SignupPlanId = PlanId;

export const SIGNUP_PLAN_OPTIONS: Record<CommunityType, readonly SignupPlanOption[]> = {
  condo_718: [
    {
      id: 'essentials',
      label: 'Essentials',
      monthlyPriceUsd: 199,
      description: 'Website, statutory document posting, owner portal, and announcements.',
    },
    {
      id: 'professional',
      label: 'Professional',
      monthlyPriceUsd: 349,
      description: 'Full platform with e-sign, violations, ARC, finance, and more.',
    },
  ],
  hoa_720: [
    {
      id: 'essentials',
      label: 'Essentials',
      monthlyPriceUsd: 199,
      description: 'Website, statutory document posting, owner portal, and announcements.',
    },
    {
      id: 'professional',
      label: 'Professional',
      monthlyPriceUsd: 349,
      description: 'Full platform with e-sign, violations, ARC, finance, and more.',
    },
  ],
  apartment: [
    {
      id: 'operations_plus',
      label: 'Operations Plus',
      monthlyPriceUsd: 499,
      description: 'Full apartment operations with lease tracking, packages, and visitors.',
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

interface RawSignupAddressFields {
  address?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county: string;
}

export interface NormalizedSignupAddressFields {
  address: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  usedStructuredAddress: boolean;
}

export function normalizeSignupAddressFields(
  value: RawSignupAddressFields,
): NormalizedSignupAddressFields {
  const explicitAddressLine1 = value.addressLine1?.trim() ?? '';
  const legacyAddress = value.address?.trim() ?? '';
  const usedStructuredAddress = explicitAddressLine1.length > 0;
  const addressLine1 = explicitAddressLine1 || legacyAddress;

  return {
    address: addressLine1,
    addressLine1,
    city: usedStructuredAddress ? value.city?.trim() ?? '' : '',
    state: usedStructuredAddress ? (value.state?.trim().toUpperCase() ?? '') : '',
    zipCode: usedStructuredAddress ? value.zipCode?.trim() ?? '' : '',
    county: value.county.trim(),
    usedStructuredAddress,
  };
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
    password: buildPasswordZodSchema(),
    communityName: z
      .string()
      .trim()
      .min(2, 'Community name is required')
      .max(160, 'Community name must be at most 160 characters'),
    address: z
      .string()
      .trim()
      .max(240, 'Address must be at most 240 characters')
      .optional(),
    addressLine1: z
      .string()
      .trim()
      .max(240, 'Street address must be at most 240 characters')
      .optional(),
    city: z
      .string()
      .trim()
      .max(100, 'City must be at most 100 characters')
      .optional(),
    state: z
      .string()
      .trim()
      .max(2, 'State must be a 2-letter abbreviation')
      .optional(),
    zipCode: z
      .string()
      .trim()
      .max(10, 'ZIP Code must be at most 10 characters')
      .optional(),
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
    planKey: z.enum(PLAN_IDS),
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
    const normalizedAddress = normalizeSignupAddressFields(value);
    // The signup form submits `addressLine1: ''` (not undefined) when blank, so
    // `usedStructuredAddress` (content-based) can't distinguish "structured form
    // left blank" from "legacy caller". Routing the missing-address error by
    // whether the structured surface was provided at all keeps the error under
    // the visible `addressLine1` field instead of a silent `address` key.
    const providedStructuredFields =
      value.addressLine1 !== undefined ||
      value.city !== undefined ||
      value.state !== undefined ||
      value.zipCode !== undefined;
    const structuredSurface = providedStructuredFields || normalizedAddress.usedStructuredAddress;

    if (!normalizedAddress.addressLine1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: structuredSurface ? 'Street address is required' : 'Address is required',
        path: [structuredSurface ? 'addressLine1' : 'address'],
      });
    } else if (normalizedAddress.addressLine1.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: structuredSurface ? 'Street address is required' : 'Address is required',
        path: [structuredSurface ? 'addressLine1' : 'address'],
      });
    }

    if (normalizedAddress.usedStructuredAddress) {
      if (!normalizedAddress.city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'City is required',
          path: ['city'],
        });
      }
      if (!normalizedAddress.state) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'State is required',
          path: ['state'],
        });
      } else if (!STATE_PATTERN.test(normalizedAddress.state)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'State must be a 2-letter abbreviation',
          path: ['state'],
        });
      }
      if (!normalizedAddress.zipCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ZIP Code is required',
          path: ['zipCode'],
        });
      } else if (!ZIP_CODE_PATTERN.test(normalizedAddress.zipCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid ZIP Code',
          path: ['zipCode'],
        });
      }
    }

    if (!isPlanAvailableForCommunityType(value.communityType, value.planKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selected plan is not available for this community type',
        path: ['planKey'],
      });
    }
  })
  .transform((value) => {
    const normalizedAddress = normalizeSignupAddressFields(value);

    return {
      ...value,
      address: normalizedAddress.address,
      addressLine1: normalizedAddress.addressLine1,
      city: normalizedAddress.city,
      state: normalizedAddress.state,
      zipCode: normalizedAddress.zipCode,
      county: normalizedAddress.county,
    };
  });

export type SignupInput = z.infer<typeof signupSchema>;
