'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Loader2, Users, ChevronDown, ChevronUp, Search, Trash2, X } from 'lucide-react';
import { AlertBanner, Badge, Button, Input, QuickFilterTabs, type BadgeVariant } from '@propertypro/ui';

export interface Member {
  roleId: number;
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  designation: string | null;
  displayTitle: string | null;
  isUnitOwner: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CommunityMembersProps {
  communityId: number;
}

// role-v3 (Phase 4.2): the canonical roles are resident / property_manager /
// root_manager. Board membership is the orthogonal `designation` column.
const ROLE_OPTIONS = [
  { value: 'resident', label: 'Resident' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'root_manager', label: 'Root Manager' },
] as const;

const ROLE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  resident: 'neutral',
  property_manager: 'info',
  root_manager: 'owner',
};

export function displayRole(member: Member): string {
  if (member.displayTitle) return member.displayTitle;
  if (member.designation === 'board_president') return 'Board President';
  if (member.designation === 'board_member') return 'Board Member';
  if (member.role === 'resident') return member.isUnitOwner ? 'Owner' : 'Tenant';
  if (member.role === 'root_manager') return 'Root Manager';
  if (member.role === 'property_manager') return 'Property Manager';
  return member.role;
}

export type MemberGroup = 'managers' | 'owners' | 'tenants';

/**
 * Which `QuickFilterTabs` bucket a member falls into. Computed client-side
 * from fields the members endpoint already returns (`role`, `designation`,
 * `isUnitOwner`) — no extra request.
 *
 * "Managers & board" folds together the two roles with elevated write access
 * (`property_manager`, `root_manager`) AND residents carrying a board
 * `designation` — a self-managed board president is operationally a manager
 * even though their `role` stays `resident` (board status is an orthogonal
 * column, not a role — see `.claude/rules/tenant-isolation.md`).
 */
export function memberGroupOf(
  member: Pick<Member, 'role' | 'designation' | 'isUnitOwner'>,
): MemberGroup {
  if (
    member.role === 'property_manager' ||
    member.role === 'root_manager' ||
    member.designation === 'board_president' ||
    member.designation === 'board_member'
  ) {
    return 'managers';
  }
  return member.isUnitOwner ? 'owners' : 'tenants';
}

export type MemberSort =
  | 'name-asc' | 'name-desc'
  | 'role-asc' | 'role-desc'
  | 'lastSignIn-asc' | 'lastSignIn-desc'
  | 'joined-asc' | 'joined-desc';

export function CommunityMembers({ communityId }: CommunityMembersProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ role: '', display_title: '', is_unit_owner: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  /**
   * A failed ACTION, as opposed to a failed load. Separate state because
   * `error` early-returns in place of the whole table (right for a load that
   * produced nothing to show); a failed removal must leave the list on screen
   * so the operator can see what did and did not happen, and retry.
   */
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<'all' | MemberGroup>('all');
  const [sort, setSort] = useState<MemberSort>('name-asc');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const groupCounts = useMemo(() => {
    const counts: Record<MemberGroup, number> = { managers: 0, owners: 0, tenants: 0 };
    for (const m of members) counts[memberGroupOf(m)] += 1;
    return counts;
  }, [members]);

  const hasRootManager = useMemo(() => members.some((m) => m.role === 'root_manager'), [members]);

  const displayedMembers = useMemo(() => {
    let result = members;

    if (group !== 'all') {
      result = result.filter((m) => memberGroupOf(m) === group);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.fullName ?? '').toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'name-asc':
          return (a.fullName ?? '').localeCompare(b.fullName ?? '');
        case 'name-desc':
          return (b.fullName ?? '').localeCompare(a.fullName ?? '');
        case 'role-asc':
          return displayRole(a).localeCompare(displayRole(b));
        case 'role-desc':
          return displayRole(b).localeCompare(displayRole(a));
        case 'lastSignIn-asc': {
          const aTime = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : Infinity;
          const bTime = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : Infinity;
          return aTime - bTime;
        }
        case 'lastSignIn-desc': {
          const aTime = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : -Infinity;
          const bTime = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : -Infinity;
          return bTime - aTime;
        }
        case 'joined-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'joined-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [members, group, search, sort]);

  function toggleSort(column: 'name' | 'role' | 'lastSignIn' | 'joined') {
    setSort((prev) => {
      const asc = `${column}-asc` as MemberSort;
      const desc = `${column}-desc` as MemberSort;
      return prev === asc ? desc : asc;
    });
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/members`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to load members');
        return;
      }
      setMembers(data.members);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  function startEdit(member: Member) {
    setEditingId(member.userId);
    setEditForm({
      role: member.role,
      display_title: member.displayTitle ?? '',
      is_unit_owner: member.isUnitOwner,
    });
    setEditError('');
  }

  async function saveEdit(userId: string) {
    setEditSaving(true);
    setEditError('');

    try {
      const body: Record<string, unknown> = { role: editForm.role };

      if (editForm.display_title) {
        body.display_title = editForm.display_title;
      } else {
        body.display_title = null;
      }

      if (editForm.role === 'resident') {
        body.is_unit_owner = editForm.is_unit_owner;
      }

      const res = await fetch(`/api/admin/communities/${communityId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error?.message ?? 'Failed to update');
        return;
      }

      setEditingId(null);
      await fetchMembers();
    } catch {
      setEditError('Network error');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    setActionError('');
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // Without this branch the row simply stayed put: the spinner closed,
        // the confirm collapsed, and the operator had no way to tell a refused
        // removal from a slow one.
        const message = await res
          .json()
          .then((body) => (body?.error?.message as string | undefined))
          .catch(() => undefined);
        setActionError(
          message ?? "We couldn't remove this member. Please try again, or reload the page to confirm the current list.",
        );
        return;
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      setActionError("We couldn't reach the server to remove this member. Check your connection and try again.");
    } finally {
      setRemoveConfirm(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-content-disabled" aria-hidden="true" />
      </div>
    );
  }

  const errorBox = (message: string) => (
    <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger" role="alert">
      {message}
    </div>
  );

  if (error) {
    return errorBox(error);
  }

  return (
    <div className="space-y-4">
      {actionError && errorBox(actionError)}

      {hasRootManager && (
        <AlertBanner
          status="info"
          variant="subtle"
          title="Root manager is protected"
          description="This community has a root manager. Root manager assignment is one of the four root-exclusive powers and cannot be changed from this table."
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-content-secondary shrink-0">
          <Users size={16} aria-hidden="true" />
          <h2 className="text-sm font-semibold">{members.length} Members</h2>
        </div>

        <QuickFilterTabs
          tabs={[
            { label: 'All', value: 'all' },
            { label: 'Managers & board', value: 'managers', count: groupCounts.managers },
            { label: 'Owners', value: 'owners', count: groupCounts.owners },
            { label: 'Tenants', value: 'tenants', count: groupCounts.tenants },
          ]}
          active={group}
          onChange={(value) => setGroup(value as 'all' | MemberGroup)}
        />
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" aria-hidden="true" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-8"
          aria-label="Search members by name or email"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-content-disabled hover:text-content-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        <table className="min-w-full divide-y divide-edge">
          <thead className="bg-surface-page">
            <tr>
              {([['Name / Email', 'name'], ['Role', 'role'], ['Last Sign In', 'lastSignIn'], ['Joined', 'joined']] as const).map(([label, column]) => {
                const isActive = sort.startsWith(`${column}-`);
                const isAsc = sort === `${column}-asc`;
                return (
                  <th
                    key={column}
                    // The chevron is the only VISUAL cue; `aria-sort` is the
                    // same fact for a screen reader, which cannot see it.
                    aria-sort={isActive ? (isAsc ? 'ascending' : 'descending') : 'none'}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1 rounded-sm hover:text-content-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                    >
                      {label}
                      {isActive && (isAsc ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />)}
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge-subtle">
            {displayedMembers.map((member) => (
              <tr key={member.userId} className="hover:bg-surface-page">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-content">
                      {member.fullName || 'No name'}
                    </p>
                    <p className="text-xs text-content-tertiary">{member.email}</p>
                    {member.phone && <p className="text-xs text-content-disabled">{member.phone}</p>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingId === member.userId ? (
                    <div className="space-y-2 min-w-[180px]">
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="w-full rounded border border-edge-strong px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {editForm.role === 'resident' && (
                        <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                          <input
                            type="checkbox"
                            checked={editForm.is_unit_owner}
                            onChange={(e) => setEditForm((f) => ({ ...f, is_unit_owner: e.target.checked }))}
                            className="rounded border-edge-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                          />
                          Unit Owner
                        </label>
                      )}
                      {editError && <p className="text-xs text-status-danger">{editError}</p>}
                      <div className="flex gap-1">
                        <Button type="button" size="sm" onClick={() => saveEdit(member.userId)} loading={editSaving}>
                          Save
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(member)}
                      className="group inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                    >
                      <Badge variant={ROLE_BADGE_VARIANT[member.role] ?? 'neutral'} size="sm">
                        {displayRole(member)}
                      </Badge>
                      <ChevronDown size={12} className="text-content-disabled group-hover:text-content-tertiary" aria-hidden="true" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-content-tertiary">
                  {member.lastSignInAt
                    ? format(new Date(member.lastSignInAt), 'MMM d, yyyy')
                    : <span className="text-content-disabled">Never</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-content-tertiary">
                  {format(new Date(member.createdAt), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 text-right">
                  {removeConfirm === member.userId ? (
                    <div className="inline-flex gap-1">
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleRemove(member.userId)}>
                        Confirm
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setRemoveConfirm(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(member.userId)}
                      className="rounded-sm p-1 text-content-disabled hover:text-status-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                      aria-label={`Remove ${member.fullName || member.email}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayedMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-content-disabled">
                  {search.trim() || group !== 'all' ? 'No members match your filters' : 'No members found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
