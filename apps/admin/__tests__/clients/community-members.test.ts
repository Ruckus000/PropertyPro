/**
 * Community members table: search filtering and column sorting tests.
 *
 * Pure function extracted here (mirroring component logic) following the
 * pattern established in portfolio.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { displayRole } from '@/components/clients/CommunityMembers';
import type { Member, MemberSort } from '@/components/clients/CommunityMembers';

// ---------------------------------------------------------------------------
// Pure function (mirrors useMemo logic in CommunityMembers component)
// ---------------------------------------------------------------------------

function filterAndSortMembers(
  members: Member[],
  search: string,
  sort: MemberSort,
): Member[] {
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
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const members: Member[] = [
  {
    roleId: 1, userId: 'u1', email: 'alice@test.com', fullName: 'Alice Smith',
    phone: null, role: 'resident', presetKey: null, displayTitle: null,
    isUnitOwner: true, lastSignInAt: '2026-03-01T10:00:00Z',
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    roleId: 2, userId: 'u2', email: 'bob@test.com', fullName: 'Bob Jones',
    phone: null, role: 'manager', presetKey: 'board_president', displayTitle: null,
    isUnitOwner: false, lastSignInAt: null,
    createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-03-01T00:00:00Z',
  },
  {
    roleId: 3, userId: 'u3', email: 'carol@test.com', fullName: null,
    phone: null, role: 'resident', presetKey: null, displayTitle: null,
    isUnitOwner: false, lastSignInAt: '2026-02-15T08:00:00Z',
    createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z',
  },
  {
    roleId: 4, userId: 'u4', email: 'dave.miller@test.com', fullName: 'Dave Miller',
    phone: null, role: 'manager', presetKey: 'cam', displayTitle: null,
    isUnitOwner: false, lastSignInAt: '2026-03-10T12:00:00Z',
    createdAt: '2025-01-15T00:00:00Z', updatedAt: '2025-01-15T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function ids(result: Member[]): string[] {
  return result.map((m) => m.userId);
}

describe('community members search', () => {
  it('filters by name (case-insensitive)', () => {
    expect(ids(filterAndSortMembers(members, 'alice', 'name-asc'))).toEqual(['u1']);
  });

  it('filters by email', () => {
    expect(ids(filterAndSortMembers(members, 'carol@', 'name-asc'))).toEqual(['u3']);
  });

  it('matches partial name', () => {
    expect(ids(filterAndSortMembers(members, 'mil', 'name-asc'))).toEqual(['u4']);
  });

  it('returns all when search is empty', () => {
    const result = filterAndSortMembers(members, '', 'name-asc');
    expect(result).toHaveLength(4);
  });

  it('returns empty when no match', () => {
    expect(filterAndSortMembers(members, 'zzz', 'name-asc')).toHaveLength(0);
  });
});

describe('community members sort by name', () => {
  // null fullName sorts as '' (before alphabetic chars)
  // Expected asc order: u3 (''), u1 (Alice), u2 (Bob), u4 (Dave)
  it('sorts name ascending', () => {
    expect(ids(filterAndSortMembers(members, '', 'name-asc'))).toEqual(['u3', 'u1', 'u2', 'u4']);
  });

  it('sorts name descending', () => {
    expect(ids(filterAndSortMembers(members, '', 'name-desc'))).toEqual(['u4', 'u2', 'u1', 'u3']);
  });
});

describe('community members sort by role', () => {
  // displayRole values: u1=Owner, u2=Board President, u3=Tenant, u4=CAM
  // Alphabetical asc: Board President (u2), CAM (u4), Owner (u1), Tenant (u3)
  it('sorts role ascending', () => {
    expect(ids(filterAndSortMembers(members, '', 'role-asc'))).toEqual(['u2', 'u4', 'u1', 'u3']);
  });

  it('sorts role descending', () => {
    expect(ids(filterAndSortMembers(members, '', 'role-desc'))).toEqual(['u3', 'u1', 'u4', 'u2']);
  });
});

describe('community members sort by last sign in', () => {
  // u3: Feb 15, u1: Mar 1, u4: Mar 10, u2: null (sorts last)
  it('sorts lastSignIn ascending, null sorts last', () => {
    expect(ids(filterAndSortMembers(members, '', 'lastSignIn-asc'))).toEqual(['u3', 'u1', 'u4', 'u2']);
  });

  // Descending: u4: Mar 10, u1: Mar 1, u3: Feb 15, u2: null (sorts last)
  it('sorts lastSignIn descending, null sorts last', () => {
    expect(ids(filterAndSortMembers(members, '', 'lastSignIn-desc'))).toEqual(['u4', 'u1', 'u3', 'u2']);
  });
});

describe('community members sort by joined', () => {
  // createdAt: u4 (Jan 15), u2 (Mar 1), u1 (Jun 1), u3 (Sep 1)
  it('sorts joined ascending', () => {
    expect(ids(filterAndSortMembers(members, '', 'joined-asc'))).toEqual(['u4', 'u2', 'u1', 'u3']);
  });

  it('sorts joined descending', () => {
    expect(ids(filterAndSortMembers(members, '', 'joined-desc'))).toEqual(['u3', 'u1', 'u2', 'u4']);
  });
});

describe('community members combined search + sort', () => {
  it('applies search then sort together', () => {
    // Search "test.com" matches all, sort by name descending
    const result = filterAndSortMembers(members, 'test.com', 'name-desc');
    expect(ids(result)).toEqual(['u4', 'u2', 'u1', 'u3']);
  });

  it('narrows search results and sorts them', () => {
    // Search "bob" matches only u2, then sort by joined-asc (only 1 result)
    const result = filterAndSortMembers(members, 'bob', 'joined-asc');
    expect(ids(result)).toEqual(['u2']);
  });

  it('searches email substring and sorts by lastSignIn', () => {
    // Search ".com" matches all, sort by lastSignIn-desc: u4, u1, u3, u2 (null last)
    const result = filterAndSortMembers(members, '.com', 'lastSignIn-desc');
    expect(ids(result)).toEqual(['u4', 'u1', 'u3', 'u2']);
  });
});
