'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  hasBoardDesignation,
  isBoardPresident,
  MANAGER_TIER_DB_ROLES,
  PM_SCOPE_DB_ROLES,
  type BoardDesignation,
} from '@propertypro/shared';
import { useBootstrapOnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import {
  OwnerCards,
  BoardMemberCards,
  TenantCards,
  type CommunityData,
  type AnnouncementData,
  type ComplianceData,
  type UnitData,
} from './welcome-snapshot-cards';

// ─── Props ────────────────────────────────────────────────────

export interface WelcomeScreenProps {
  firstName: string;
  /** The v3 DB role (e.g. 'resident', 'manager', 'property_manager', 'root_manager', 'pm_admin'). */
  role: string;
  /** Nullable board designation — the source of truth for the board distinction. */
  designation: BoardDesignation | null;
  /** Whether the member owns a unit (only meaningful for residents). */
  isUnitOwner: boolean;
  communityId: number;
  community: CommunityData;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  announcement: AnnouncementData | null;
  compliance: ComplianceData;
  unit: UnitData | null;
  recentActivity: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Pre-resolved by the server component — avoids importing the server-only checklist service. */
  checklistDisplayItems: Array<{ key: string; displayText: string }>;
}

// ─── Role display helpers ─────────────────────────────────────

/**
 * True for any manager-tier or PM-scope v3 role. The legacy cam/site_manager
 * distinction required a presetKey; role-v3 (Phase 3.3) collapses both into the
 * single "Property Manager" label — onboarding-only, no permission change.
 */
function isManagerTier(role: string): boolean {
  return (
    (MANAGER_TIER_DB_ROLES as readonly string[]).includes(role) ||
    (PM_SCOPE_DB_ROLES as readonly string[]).includes(role)
  );
}

function getRoleGreeting(
  role: string,
  designation: BoardDesignation | null,
  isUnitOwner: boolean,
): string {
  if (isBoardPresident(designation)) return 'Board President';
  if (hasBoardDesignation(designation)) return 'Board Member';
  if (isManagerTier(role)) return 'Property Manager';
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Member';
}

function getRoleSubtext(
  role: string,
  designation: BoardDesignation | null,
  isUnitOwner: boolean,
  communityName: string,
): string {
  if (hasBoardDesignation(designation))
    return `Here is a snapshot of ${communityName} to get you started.`;
  if (isManagerTier(role))
    return `Here is an overview of ${communityName} for your review.`;
  if (role === 'resident' && isUnitOwner)
    return `Here is what is happening at ${communityName}.`;
  if (role === 'resident')
    return `Here are some helpful resources for living at ${communityName}.`;
  return `Here is your community at a glance.`;
}

/** Determines which card set to render based on the v3 role + designation. */
function getCardCategory(
  role: string,
  designation: BoardDesignation | null,
  isUnitOwner: boolean,
): 'owner' | 'board' | 'tenant' {
  if (hasBoardDesignation(designation) || isManagerTier(role)) return 'board';
  if (role === 'resident') return isUnitOwner ? 'owner' : 'tenant';
  return 'owner';
}

// ─── Component ────────────────────────────────────────────────

export function WelcomeScreen({
  firstName,
  role,
  designation,
  isUnitOwner,
  communityId,
  community,
  communityType,
  announcement,
  compliance,
  unit,
  recentActivity,
  logoUrl,
  primaryColor,
  checklistDisplayItems,
}: WelcomeScreenProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const bootstrapChecklist = useBootstrapOnboardingChecklist();

  const roleLabel = getRoleGreeting(role, designation, isUnitOwner);
  const subtext = getRoleSubtext(role, designation, isUnitOwner, community.name);
  const cardCategory = getCardCategory(role, designation, isUnitOwner);

  async function handleGoToDashboard() {
    setIsNavigating(true);
    try {
      // Bootstrap checklist items via the onboarding-checklist hook.
      await bootstrapChecklist.mutateAsync(communityId);
    } catch {
      // Non-blocking: checklist bootstrap failure should not prevent navigation
    }
    router.push(`/dashboard?communityId=${communityId}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Community logo / icon + greeting */}
      <div className="mb-8 text-center">
        {logoUrl ? (
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-edge bg-surface-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={`${community.name} logo`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-edge"
            style={primaryColor ? { backgroundColor: primaryColor } : undefined}
          >
            <span
              className={cn(
                'text-2xl font-bold',
                primaryColor ? 'text-white' : 'text-content-secondary',
              )}
              aria-hidden="true"
            >
              {community.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          {roleLabel} at {community.name}
        </p>
        <p className="mt-2 text-sm text-content-tertiary">{subtext}</p>
      </div>

      {/* Snapshot cards */}
      <section aria-label="Community snapshot" className="mb-8">
        {cardCategory === 'owner' && (
          <OwnerCards
            communityId={communityId}
            community={community}
            announcement={announcement}
            compliance={compliance}
          />
        )}
        {cardCategory === 'board' && (
          <BoardMemberCards
            communityId={communityId}
            community={community}
            compliance={compliance}
            recentActivity={recentActivity}
          />
        )}
        {cardCategory === 'tenant' && (
          <TenantCards
            communityId={communityId}
            community={community}
            unit={unit}
          />
        )}
      </section>

      {/* CTA button */}
      <div className="mb-8 text-center">
        <button
          type="button"
          onClick={handleGoToDashboard}
          disabled={isNavigating}
          className={cn(
            'inline-flex h-12 items-center justify-center rounded-md px-8 text-base font-semibold text-white shadow-sm transition-colors',
            'bg-interactive hover:bg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'motion-reduce:transition-none',
          )}
        >
          {isNavigating ? (
            <>
              <svg
                className="mr-2 h-4 w-4 animate-spin motion-reduce:hidden"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Setting up your dashboard...
            </>
          ) : (
            'Go to your dashboard'
          )}
        </button>
      </div>

      {/* Checklist preview */}
      {checklistDisplayItems.length > 0 && (
        <section
          aria-label="Things to explore"
          className="rounded-md border border-edge bg-surface-card p-5 shadow-sm"
        >
          <h2 className="mb-4 text-base font-semibold text-content">
            A few things to explore
          </h2>
          <ul className="space-y-3">
            {checklistDisplayItems.map((item) => (
              <li key={item.key} className="flex items-center gap-3">
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-edge bg-transparent"
                  aria-hidden="true"
                />
                <span className="text-sm text-content">{item.displayText}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
