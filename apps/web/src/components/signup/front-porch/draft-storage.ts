/**
 * The signup answers, kept in localStorage until the community is live. The
 * emailed sign-in link opens a NEW tab, so per-tab sessionStorage would lose
 * everything on any re-sign-in; the Stripe return page reads them too, so the
 * community card stays assembled through "Setting up" and "Live".
 *
 * Scoped to the signed-in address (`owner`): a draft is restored only for the
 * account that wrote it, so a shared computer does not hand one person's
 * answers to the next. Cleared when the community goes live.
 *
 * Best-effort by design: every access is guarded, and a missing draft only
 * means the card shows placeholders.
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
  /** The pending signup the trial step created; lets the "you" step exclude it. */
  signupRequestId?: string;
  /** Lower-cased email of the account that wrote this draft. */
  owner?: string;
}

const DRAFT_KEY = 'pp.signup.draft.v1';

/** `owner`: only return a draft written by this address (omit to read any). */
export function readSignupDraft(owner?: string): Partial<SignupDraft> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<SignupDraft>;
    if (owner !== undefined && draft.owner !== owner.toLowerCase()) return null;
    return draft;
  } catch {
    return null;
  }
}

export function writeSignupDraft(draft: SignupDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage disabled: the flow still works, it just won't survive a
    // refresh or a new tab.
  }
}

export function clearSignupDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}
