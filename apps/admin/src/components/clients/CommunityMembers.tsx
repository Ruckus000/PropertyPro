'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Loader2, Users, ChevronDown, ChevronUp, Search, Trash2, X } from 'lucide-react';

export interface Member {
  roleId: number;
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  presetKey: string | null;
  displayTitle: string | null;
  isUnitOwner: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CommunityMembersProps {
  communityId: number;
  communityType: string;
}

const ROLE_OPTIONS = [
  { value: 'resident', label: 'Resident' },
  { value: 'manager', label: 'Manager' },
  { value: 'pm_admin', label: 'PM Admin' },
] as const;

const PRESET_OPTIONS: Record<string, { value: string; label: string }[]> = {
  condo_718: [
    { value: 'board_president', label: 'Board President' },
    { value: 'board_member', label: 'Board Member' },
    { value: 'cam', label: 'Community Assoc. Manager' },
  ],
  hoa_720: [
    { value: 'board_president', label: 'Board President' },
    { value: 'board_member', label: 'Board Member' },
    { value: 'cam', label: 'Community Assoc. Manager' },
  ],
  apartment: [
    { value: 'site_manager', label: 'Site Manager' },
  ],
};

const ROLE_BADGES: Record<string, string> = {
  resident: 'bg-gray-100 text-gray-600',
  manager: 'bg-blue-100 text-blue-700',
  pm_admin: 'bg-purple-100 text-purple-700',
};

export function displayRole(member: Member): string {
  if (member.displayTitle) return member.displayTitle;
  if (member.presetKey) {
    const labels: Record<string, string> = {
      board_president: 'Board President',
      board_member: 'Board Member',
      cam: 'CAM',
      site_manager: 'Site Manager',
    };
    return labels[member.presetKey] ?? member.presetKey;
  }
  if (member.role === 'resident') return member.isUnitOwner ? 'Owner' : 'Tenant';
  if (member.role === 'pm_admin') return 'PM Admin';
  return 'Manager';
}

export type MemberSort =
  | 'name-asc' | 'name-desc'
  | 'role-asc' | 'role-desc'
  | 'lastSignIn-asc' | 'lastSignIn-desc'
  | 'joined-asc' | 'joined-desc';

export function CommunityMembers({ communityId, communityType }: CommunityMembersProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ role: '', preset_key: '', display_title: '', is_unit_owner: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MemberSort>('name-asc');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayedMembers = useMemo(() => {
    let result = members;

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
  }, [members, search, sort]);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function startEdit(member: Member) {
    setEditingId(member.userId);
    setEditForm({
      role: member.role,
      preset_key: member.presetKey ?? '',
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

      if (editForm.role === 'manager' && editForm.preset_key) {
        body.preset_key = editForm.preset_key;
      } else {
        body.preset_key = null;
      }

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
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      }
    } finally {
      setRemoveConfirm(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-gray-700 shrink-0">
          <Users size={16} />
          <h2 className="text-sm font-semibold">{members.length} Members</h2>
        </div>

        <div className="relative flex-1 max-w-sm" ref={dropdownRef}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
            onFocus={() => { if (search.trim()) setDropdownOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setDropdownOpen(false); }}
            className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-8 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(''); setDropdownOpen(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          ) : (
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          )}

          {dropdownOpen && search.trim() && (
            <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {displayedMembers.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">No members found</p>
              ) : (
                <>
                  {displayedMembers.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{m.fullName || 'No name'}</p>
                        <p className="truncate text-xs text-gray-500">{m.email}</p>
                      </div>
                      <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGES[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {displayRole(m)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-400">
                    {displayedMembers.length} of {members.length} members
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-e1">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {([['Name / Email', 'name'], ['Role', 'role'], ['Last Sign In', 'lastSignIn'], ['Joined', 'joined']] as const).map(([label, column]) => {
                const isActive = sort.startsWith(`${column}-`);
                const isAsc = sort === `${column}-asc`;
                return (
                  <th key={column} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1 hover:text-gray-700"
                    >
                      {label}
                      {isActive && (isAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedMembers.map((member) => (
              <tr key={member.userId} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {member.fullName || 'No name'}
                    </p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                    {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingId === member.userId ? (
                    <div className="space-y-2 min-w-[180px]">
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value, preset_key: '' }))}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {editForm.role === 'manager' && (PRESET_OPTIONS[communityType] ?? []).length > 0 && (
                        <select
                          value={editForm.preset_key}
                          onChange={(e) => setEditForm((f) => ({ ...f, preset_key: e.target.value }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">Custom Manager</option>
                          {(PRESET_OPTIONS[communityType] ?? []).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {editForm.role === 'resident' && (
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={editForm.is_unit_owner}
                            onChange={(e) => setEditForm((f) => ({ ...f, is_unit_owner: e.target.checked }))}
                            className="rounded border-gray-300"
                          />
                          Unit Owner
                        </label>
                      )}
                      {editError && <p className="text-xs text-red-600">{editError}</p>}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(member.userId)}
                          disabled={editSaving}
                          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {editSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(member)}
                      className="group inline-flex items-center gap-1"
                    >
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGES[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {displayRole(member)}
                      </span>
                      <ChevronDown size={12} className="text-gray-300 group-hover:text-gray-500" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {member.lastSignInAt
                    ? format(new Date(member.lastSignInAt), 'MMM d, yyyy')
                    : <span className="text-gray-300">Never</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {format(new Date(member.createdAt), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 text-right">
                  {removeConfirm === member.userId ? (
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleRemove(member.userId)}
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveConfirm(null)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(member.userId)}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayedMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  {search.trim() ? 'No members match your search' : 'No members found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
