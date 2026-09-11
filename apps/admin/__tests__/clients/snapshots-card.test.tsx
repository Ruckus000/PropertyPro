// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapshotsCard } from '@/components/clients/SnapshotsCard';
import type { CommunitySnapshotEntry } from '@/lib/server/community-snapshots';

const retained: CommunitySnapshotEntry = {
  id: 1,
  publishedAt: '2026-03-14T12:00:00.000Z',
  changeCount: 3,
  changeLabels: ['Hero updated', 'Logo changed'],
  restorable: true,
};

const pruned: CommunitySnapshotEntry = {
  id: 2,
  publishedAt: '2026-01-01T00:00:00.000Z',
  changeCount: 1,
  changeLabels: [],
  restorable: false,
};

describe('SnapshotsCard', () => {
  it('renders an empty state with no publishes', () => {
    render(<SnapshotsCard snapshots={[]} />);
    expect(screen.getByText('No publishes yet')).toBeTruthy();
  });

  it('never renders a Restore control — this history is read-only', () => {
    render(<SnapshotsCard snapshots={[retained, pruned]} />);
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull();
    expect(screen.getByText(/Restoring a prior publish/)).toBeTruthy();
  });

  it('labels a retained snapshot distinctly from a pruned one, honouring snapshot IS NOT NULL', () => {
    render(<SnapshotsCard snapshots={[retained, pruned]} />);

    expect(screen.getByText('Content retained')).toBeTruthy();
    expect(screen.getByText('Content pruned')).toBeTruthy();
    expect(screen.getByText('Hero updated, Logo changed')).toBeTruthy();
    expect(screen.getByText('1 change')).toBeTruthy();
  });
});
