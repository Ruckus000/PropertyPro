'use client';

/**
 * Roles & Access screen body (role-v3 Phase 2c). Root-only surface with four
 * sections, all driven by `useCommunityRoster`:
 *
 *  1. Current root + Transfer (typed-confirm modal)
 *  2. Property managers (per-row revoke with inline confirm)
 *  3. Members (promote to property manager)
 *  4. Board designations (condo/HOA only — hidden for apartments)
 *
 * All `/api/v1` access goes through the hooks (never raw fetch in this
 * component) — `guard:component-api-calls`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  ShieldCheck,
  UserCog,
  Users,
  Crown,
  Gavel,
} from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useCommunityRoster,
  useAssignPropertyManager,
  useRevokePropertyManager,
  useTransferRoot,
  useSetDesignation,
  ADMIN_LIMIT_REACHED,
  type RosterMember,
  type BoardDesignation,
} from '@/hooks/use-role-management';

interface RolesAccessClientProps {
  communityId: number;
  communityType: CommunityType;
  currentRootUserId: string;
  communityName?: string;
}

// ── Shared section shell ──────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: true }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-card p-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-content">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-content-secondary">{description}</p>
          )}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function RolesAccessClient({
  communityId,
  communityType,
  currentRootUserId,
  communityName,
}: RolesAccessClientProps) {
  const {
    data: roster,
    isLoading,
    isError,
    error,
  } = useCommunityRoster(communityId);

  const { currentRoot, propertyManagers, members } = useMemo(() => {
    const all = roster ?? [];
    return {
      currentRoot:
        all.find((m) => m.role === 'root_manager') ??
        ({ userId: currentRootUserId, fullName: 'You', role: 'root_manager' } as RosterMember),
      propertyManagers: all.filter((m) => m.role === 'property_manager'),
      members: all.filter((m) => m.role === 'resident'),
    };
  }, [roster, currentRootUserId]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="roles-access-loading">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="We couldn’t load the community roster"
        description={error?.message ?? 'Please refresh and try again.'}
      />
    );
  }

  const showBoard = communityType !== 'apartment';

  return (
    <div className="space-y-6">
      <RootSection
        communityId={communityId}
        currentRoot={currentRoot}
        propertyManagers={propertyManagers}
        communityName={communityName}
      />

      <PropertyManagersSection
        communityId={communityId}
        propertyManagers={propertyManagers}
      />

      <MembersSection communityId={communityId} members={members} />

      {showBoard && (
        <BoardSection communityId={communityId} members={members} />
      )}
    </div>
  );
}

// ── 1. Current root + Transfer ────────────────────────────────────────────

function RootSection({
  communityId,
  currentRoot,
  propertyManagers,
  communityName,
}: {
  communityId: number;
  currentRoot: RosterMember;
  propertyManagers: RosterMember[];
  communityName?: string;
}) {
  const router = useRouter();
  const transfer = useTransferRoot(communityId);
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [confirmText, setConfirmText] = useState('');

  // If we have the community name, require typing it; otherwise require TRANSFER.
  const confirmTarget = communityName?.trim() ? communityName.trim() : 'TRANSFER';
  const usingName = Boolean(communityName?.trim());
  const confirmMatches = confirmText.trim() === confirmTarget;
  const canConfirm = confirmMatches && selectedUserId.length > 0 && !transfer.isPending;

  function reset() {
    setOpen(false);
    setSelectedUserId('');
    setConfirmText('');
  }

  return (
    <Section
      icon={Crown}
      title="Root manager"
      description="The root manager controls role assignments for this community."
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-content">
          <span className="font-medium">{currentRoot.fullName}</span>{' '}
          <span className="text-content-secondary">(root manager)</span>
        </p>
        {!open && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={propertyManagers.length === 0}
            data-testid="transfer-root-open"
          >
            Transfer root
          </Button>
        )}
      </div>

      {propertyManagers.length === 0 && (
        <p className="mt-3 text-xs text-content-secondary">
          Promote a member to property manager before you can transfer the root role.
        </p>
      )}

      {transfer.isSuccess && (
        <div className="mt-3">
          <AlertBanner
            status="success"
            variant="subtle"
            title="Root manager transferred. You are now a property manager."
          />
        </div>
      )}

      {transfer.isError && (
        <div className="mt-3">
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn’t transfer the root role"
            description={transfer.error?.message ?? 'Please try again.'}
          />
        </div>
      )}

      {open && (
        <div
          className="mt-4 space-y-4 rounded-md border border-border p-4"
          data-testid="transfer-root-modal"
        >
          <AlertBanner
            status="warning"
            variant="subtle"
            title="You will become a property_manager."
            description="The selected property manager will become the new root manager. This cannot be undone by you afterward."
          />

          <div className="space-y-2">
            <label
              htmlFor="transfer-root-target"
              className="block text-sm font-medium text-content"
            >
              New root manager
            </label>
            <select
              id="transfer-root-target"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              data-testid="transfer-root-select"
            >
              <option value="">Select a property manager…</option>
              {propertyManagers.map((pm) => (
                <option key={pm.userId} value={pm.userId}>
                  {pm.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="transfer-root-confirm"
              className="block text-sm font-medium text-content"
            >
              {usingName ? (
                <>
                  Type the community name{' '}
                  <span className="font-semibold">{confirmTarget}</span> to confirm
                </>
              ) : (
                <>
                  Type <span className="font-semibold">TRANSFER</span> to confirm
                </>
              )}
            </label>
            <input
              id="transfer-root-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              data-testid="transfer-root-confirm-input"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirm}
              onClick={() =>
                transfer.mutate(
                  { toUserId: selectedUserId },
                  {
                    onSuccess: () => {
                      // The caller is now a plain property_manager — close the
                      // modal and send them to the dashboard (the server page
                      // would redirect them there on reload anyway).
                      reset();
                      router.push(`/dashboard?communityId=${communityId}`);
                    },
                  },
                )
              }
              data-testid="transfer-root-confirm"
            >
              {transfer.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Transfer root
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── 2. Property managers ──────────────────────────────────────────────────

function PropertyManagersSection({
  communityId,
  propertyManagers,
}: {
  communityId: number;
  propertyManagers: RosterMember[];
}) {
  const revoke = useRevokePropertyManager(communityId);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Track which row's revoke is in flight so only that row shows a spinner /
  // disables, instead of every row reacting to the shared mutation state.
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  return (
    <Section
      icon={UserCog}
      title="Property managers"
      description="Property managers help administer this community."
    >
      {propertyManagers.length === 0 ? (
        <EmptyState
          size="sm"
          icon={UserCog}
          title="No property managers yet"
          description="Promote a member below to add your first property manager."
        />
      ) : (
        <ul className="space-y-3">
          {propertyManagers.map((pm) => {
            const confirming = confirmingId === pm.userId;
            return (
              <li
                key={pm.userId}
                data-testid={`pm-row-${pm.userId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <p className="min-w-0 truncate text-sm font-medium text-content">
                  {pm.fullName}
                </p>
                {confirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-content-secondary">
                      Revoke property manager?
                    </span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => {
                        setPendingRevokeId(pm.userId);
                        revoke.mutate(
                          { userId: pm.userId },
                          { onSettled: () => setPendingRevokeId(null) },
                        );
                        setConfirmingId(null);
                      }}
                      data-testid={`pm-revoke-confirm-${pm.userId}`}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending && pendingRevokeId === pm.userId}
                    onClick={() => setConfirmingId(pm.userId)}
                    data-testid={`pm-revoke-${pm.userId}`}
                  >
                    {revoke.isPending && pendingRevokeId === pm.userId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revoke.isError && (
        <div className="mt-3">
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn’t update that property manager. Please try again."
            description={revoke.error?.message ?? undefined}
          />
        </div>
      )}
    </Section>
  );
}

// ── 3. Members ────────────────────────────────────────────────────────────

function MembersSection({
  communityId,
  members,
}: {
  communityId: number;
  members: RosterMember[];
}) {
  const assign = useAssignPropertyManager(communityId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <Section
      icon={Users}
      title="Members"
      description="Promote a member to property manager to give them admin access."
    >
      {members.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Users}
          title="No members to promote"
          description="Members appear here once residents join this community."
        />
      ) : (
        <ul className="space-y-3">
          {members.map((member) => (
            <li
              key={member.userId}
              data-testid={`member-row-${member.userId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <p className="min-w-0 truncate text-sm font-medium text-content">
                {member.fullName}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={assign.isPending && pendingId === member.userId}
                onClick={() => {
                  setPendingId(member.userId);
                  assign.mutate({ userId: member.userId });
                }}
                data-testid={`member-promote-${member.userId}`}
              >
                {assign.isPending && pendingId === member.userId && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Promote to property manager
              </Button>
            </li>
          ))}
        </ul>
      )}

      {assign.isError && (
        <div className="mt-4">
          {assign.error?.code === ADMIN_LIMIT_REACHED ? (
            // Plan admin cap hit — this is a billing decision, not a failure.
            // Offer the upgrade path (or remove-an-admin) rather than a red error.
            <AlertBanner
              status="warning"
              variant="subtle"
              title={
                assign.error.maxAdmins
                  ? `Your plan includes up to ${assign.error.maxAdmins} administrators`
                  : 'Administrator limit reached'
              }
              description="Remove a property manager above, or upgrade your plan to add another administrator."
              action={
                <Link
                  href={`/settings/billing?communityId=${communityId}`}
                  className="text-sm font-medium text-content-link underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  data-testid="admin-limit-upgrade-link"
                >
                  View billing &amp; upgrade
                </Link>
              }
              data-testid="admin-limit-banner"
            />
          ) : (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="We couldn’t promote that member. Please try again."
              description={assign.error?.message ?? undefined}
            />
          )}
        </div>
      )}
    </Section>
  );
}

// ── 4. Board designations (condo/HOA only) ────────────────────────────────

// The two board designations the root manager can assign. Defined once so the
// literal strings (the designations API contract values) live in a single
// place rather than being repeated across the section's buttons.
const PRESIDENT: BoardDesignation = 'board_president';
const MEMBER: BoardDesignation = 'board_member';

function BoardSection({
  communityId,
  members,
}: {
  communityId: number;
  members: RosterMember[];
}) {
  const setDesignation = useSetDesignation(communityId);
  // Per-target ack state: when a 409 came back, show the eligibility checkbox.
  // We remember the designation the user originally attempted so the ack
  // re-submit re-sends THAT designation (not a hard-coded one).
  const [ackNeededFor, setAckNeededFor] = useState<string | null>(null);
  const [ackDesignation, setAckDesignation] = useState<BoardDesignation>(MEMBER);
  const [ackChecked, setAckChecked] = useState(false);
  // Per-target inline confirm before assigning president. The roster does not
  // expose existing designations, so we cannot detect whether a president
  // already exists; we conservatively require a confirm step for EVERY
  // president assignment (the safe default for a possibly-reassigning action).
  const [reassignConfirmFor, setReassignConfirmFor] = useState<string | null>(null);

  async function submit(
    userId: string,
    designation: BoardDesignation,
    acknowledgeNonOwner = false,
  ) {
    const result = await setDesignation.mutateAsync({
      userId,
      designation,
      acknowledgeNonOwner,
    });
    if (!result.ok && result.reason === 'non_owner_requires_ack') {
      setAckNeededFor(userId);
      setAckDesignation(designation);
      setAckChecked(false);
    } else {
      setAckNeededFor(null);
      setAckChecked(false);
      setReassignConfirmFor(null);
    }
  }

  return (
    <Section
      icon={Gavel}
      title="Board"
      description="Set board designations for members of this community."
    >
      <AlertBanner
        status="info"
        variant="subtle"
        title="Board eligibility is governed by your bylaws and Florida statute; PropertyPro records the designation you set and does not determine eligibility."
      />

      {members.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            size="sm"
            icon={Gavel}
            title="No members to designate"
            description="Board designations can be set once members join."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {members.map((member) => {
            const needsAck = ackNeededFor === member.userId;
            const confirmingReassign = reassignConfirmFor === member.userId;
            return (
              <li
                key={member.userId}
                data-testid={`board-row-${member.userId}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-content">
                    {member.fullName}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmingReassign ? (
                      <>
                        <span className="text-xs text-content-secondary">
                          Assign as president? This replaces any current president.
                        </span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => submit(member.userId, PRESIDENT)}
                          data-testid={`board-president-confirm-${member.userId}`}
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setReassignConfirmFor(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReassignConfirmFor(member.userId)}
                          data-testid={`board-president-${member.userId}`}
                        >
                          President
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => submit(member.userId, MEMBER)}
                          data-testid={`board-member-${member.userId}`}
                        >
                          Member
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => submit(member.userId, null)}
                          data-testid={`board-clear-${member.userId}`}
                        >
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {needsAck && (
                  <div className="mt-3 space-y-2 rounded-md border border-status-warning-border bg-status-warning-subtle p-3">
                    <label className="flex items-start gap-2 text-sm text-content">
                      <input
                        type="checkbox"
                        checked={ackChecked}
                        onChange={(e) => setAckChecked(e.target.checked)}
                        className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        data-testid={`board-ack-${member.userId}`}
                      />
                      <span>
                        I confirm this person is eligible per our bylaws.
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={!ackChecked || setDesignation.isPending}
                      onClick={() => submit(member.userId, ackDesignation, true)}
                      data-testid={`board-ack-submit-${member.userId}`}
                    >
                      {setDesignation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      )}
                      Confirm designation
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {setDesignation.isError && (
        <div className="mt-3">
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn’t update the designation"
            description={setDesignation.error?.message ?? 'Please try again.'}
          />
        </div>
      )}
    </Section>
  );
}

export default RolesAccessClient;
