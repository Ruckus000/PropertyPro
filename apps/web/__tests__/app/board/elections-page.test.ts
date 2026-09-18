/**
 * Direct election links must explain the attorney-review gate without weakening
 * the API gate. The page is deliberately a read-only friendly state; routes
 * still enforce requireElectionsEnabled for every election operation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getFeaturesForCommunityMock,
  requirePageAuthenticatedUserIdMock,
  requirePageCommunityMembershipMock,
  requirePermissionMock,
  boardElectionsPanelMock,
  redirectMock,
} = vi.hoisted(() => ({
  getFeaturesForCommunityMock: vi.fn(),
  requirePageAuthenticatedUserIdMock: vi.fn(),
  requirePageCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  boardElectionsPanelMock: vi.fn(() => null),
  redirectMock: vi.fn(),
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requirePageAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requirePageCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/components/board/board-elections-panel', () => ({
  BoardElectionsPanel: boardElectionsPanelMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import BoardElectionsPage from '../../../src/app/(authenticated)/communities/[id]/board/elections/page';

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textContent((node as { props: { children?: unknown } }).props.children);
  }
  return '';
}

function hrefForText(node: unknown, label: string): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const href = hrefForText(child, label);
      if (href) return href;
    }
    return undefined;
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props: { children?: unknown; href?: string } }).props;
    if (textContent(props.children).trim() === label) return props.href;
    return hrefForText(props.children, label);
  }
  return undefined;
}

describe('BoardElectionsPage', () => {
  const membership = {
    userId: 'user-1',
    communityId: 42,
    communityType: 'condo_718',
    electionsAttorneyReviewed: false,
    isAdmin: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requirePageAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requirePageCommunityMembershipMock.mockResolvedValue(membership);
    getFeaturesForCommunityMock.mockReturnValue({ hasVoting: true });
  });

  it('shows the attorney-review explanation and a safe board return for a disabled community', async () => {
    const page = await BoardElectionsPage({ params: Promise.resolve({ id: '42' }) });

    expect(textContent(page)).toContain('Attorney review required before elections');
    expect(textContent(page)).toContain('Polls and forum discussions are available now.');
    expect(hrefForText(page, 'Go to polls')).toBe('/communities/42/board/polls');
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(boardElectionsPanelMock).not.toHaveBeenCalled();
  });

  it('redirects a non-voting community to the available Board polls page', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT');
    getFeaturesForCommunityMock.mockReturnValue({ hasVoting: false });
    requirePageCommunityMembershipMock.mockResolvedValue({
      ...membership,
      communityType: 'apartment',
    });
    redirectMock.mockImplementation(() => {
      throw redirectSignal;
    });

    await expect(BoardElectionsPage({ params: Promise.resolve({ id: '42' }) })).rejects.toBe(
      redirectSignal,
    );
    expect(redirectMock).toHaveBeenCalledWith('/communities/42/board/polls');
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(boardElectionsPanelMock).not.toHaveBeenCalled();
  });

  it('keeps the existing election panel and permission gate once attorney review is complete', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue({
      ...membership,
      electionsAttorneyReviewed: true,
    });

    const page = await BoardElectionsPage({ params: Promise.resolve({ id: '42' }) });

    expect(requirePermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42 }),
      'elections',
      'read',
    );
    expect(page.type).toBe(boardElectionsPanelMock);
    expect(page.props).toMatchObject({ communityId: 42, isAdmin: true, userId: 'user-1' });
  });
});
