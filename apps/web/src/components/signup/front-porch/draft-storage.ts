/**
 * The signup answers, kept in sessionStorage until they become a
 * `pending_signups` row. The Stripe return page reads them too: Checkout
 * redirects within the same tab, so the community card can stay assembled
 * through "Setting up" and "Live" without another database read.
 *
 * Per-tab and best-effort by design: every access is guarded, and a missing
 * draft only means the card shows placeholders.
 */
import type { CommunityType } from '@propertypro/shared';
import type { SignupPlanId } from '@/lib/auth/signup-schema';

export type SignupStep = 'email' | 'verify' | 'type' | 'place' | 'you' | 'reveal' | 'trial';

export interface SignupDraft {
  communityName: string;
  communityType: CommunityType | null;
  addressLine1: string;
  city: string;
  zipCode: string;
  county: string;
  addressKey: string | null;
  manualAddress: boolean;
  unitCount: string;
  primaryContactName: string;
  slug: string;
  slugDirty: boolean;
  planKey: SignupPlanId | null;
  step: SignupStep;
  /** The web address as submitted at the trial step; read by the return page. */
  submittedSlug?: string;
}

const DRAFT_KEY = 'pp.signup.draft.v1';

export function readSignupDraft(): Partial<SignupDraft> | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<SignupDraft>) : null;
  } catch {
    return null;
  }
}

export function writeSignupDraft(draft: SignupDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode / storage disabled: the flow still works, it just won't
    // survive a refresh.
  }
}

export function clearSignupDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}
