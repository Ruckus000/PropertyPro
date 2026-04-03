'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
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
  /** The effective display role (e.g. 'owner', 'board_member', 'cam', 'tenant', 'resident'). */
  role: string;
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

function getRoleGreeting(role: string): string {
  switch (role) {
    case 'board_president':
      return 'Board President';
    case 'board_member':
      return 'Board Member';
    case 'cam':
      return 'Community Association Manager';
    case 'site_manager':
      return 'Site Manager';
    case 'property_manager_admin':
    case 'pm_admin':
      return 'Property Manager';
    case 'owner':
      return 'Owner';
    case 'tenant':
      return 'Tenant';
    default:
      return 'Member';
  }
}

function getRoleSubtext(role: string, communityName: string): string {
  switch (role) {
    case 'board_president':
    case 'board_member':
      return `Here is a snapshot of ${communityName} to get you started.`;
    case 'cam':
    case 'site_manager':
    case 'property_manager_admin':
    case 'pm_admin':
      return `Here is an overview of ${communityName} for your review.`;
    case 'owner':
      return `Here is what is happening at ${communityName}.`;
    case 'tenant':
      return `Here are some helpful resources for living at ${communityName}.`;
    default:
      return `Here is your community at a glance.`;
  }
}

/** Determines which card set to render based on role. */
function getCardCategory(role: string): 'owner' | 'board' | 'tenant' {
  switch (role) {
    case 'board_president':
    case 'board_member':
    case 'cam':
    case 'site_manager':
    case 'property_manager_admin':
    case 'pm_admin':
    case 'manager':
      return 'board';
    case 'owner':
      return 'owner';
    case 'tenant':
      return 'tenant';
    default:
      // Residents default to owner view
      return 'owner';
  }
}

// ─── Component ────────────────────────────────────────────────

export function WelcomeScreen({
  firstName,
  role,
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

  const roleLabel = getRoleGreeting(role);
  const subtext = getRoleSubtext(role, community.name);
  const cardCategory = getCardCategory(role);

  async function handleGoToDashboard() {
    setIsNavigating(true);
    try {
      // Bootstrap checklist items via POST to the API
      await fetch('/api/v1/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
    } catch {
      // Non-blocking: checklist bootstrap failure should not prevent navigation
    }
    router.push('/dashboard');
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
            community={community}
            announcement={announcement}
            compliance={compliance}
          />
        )}
        {cardCategory === 'board' && (
          <BoardMemberCards
            community={community}
            compliance={compliance}
            recentActivity={recentActivity}
          />
        )}
        {cardCategory === 'tenant' && (
          <TenantCards
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
