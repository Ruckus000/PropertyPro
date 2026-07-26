/**
 * The review-and-publish sheet (Phase 5).
 *
 * The assertions here are mostly about the decisions the sheet encodes rather
 * than the markup it emits: that publishing is atomic (no tick boxes, ever),
 * that a blocking issue names the section it is about instead of saying "fix
 * errors", that a publish with nothing to publish is impossible rather than a
 * silent no-op request, that a 409 reads as "someone else published" and not as
 * a generic failure, and that a failure leaves a receipt behind that a
 * re-render cannot sweep away.
 *
 * `@/hooks/use-content-blocks` is mocked COMPLETELY — a partial factory fails
 * only at module load for whichever component happens to reach the missing
 * export, and reads as an unrelated component breaking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOMBSTONE_BLOCK_TYPE, type Change } from '@propertypro/shared';
import {
  PublishSheet,
  groupChanges,
} from '@/components/pm/site-editor-v3/publish/PublishSheet';
import { PublishConflictError, type PublishSiteResult } from '@/hooks/use-publish-site';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// ── block fixtures ─────────────────────────────────────────────────────────

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 1,
    blockType: 'text',
    blockOrder: 2,
    content: { heading: 'Pool rules', body: 'No glass by the pool, please.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const heroBlock = (overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary =>
  block({
    id: 100,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Sunset Condos', subtitle: 'Miami Beach' },
    ...overrides,
  });

const PUBLISHED: SiteBlockSummary[] = [heroBlock(), block({ id: 1, blockOrder: 2 })];

/** One edited text section — the ordinary case. */
const DRAFT_ONE_EDIT: SiteBlockSummary[] = [
  heroBlock(),
  block({
    id: 2,
    blockOrder: 2,
    isDraft: true,
    publishedAt: null,
    content: { heading: 'Pool rules', body: 'No glass by the pool, and no diving.' },
  }),
];

// ── hook mocks ─────────────────────────────────────────────────────────────

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  token: null as string | null,
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

const refetch = vi.hoisted(() => vi.fn());

function draftQuery() {
  return {
    data: queries.isPending || queries.isError ? undefined : queries.draft,
    isPending: queries.isPending,
    isError: queries.isError,
    error: queries.error,
    refetch,
  };
}

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => draftQuery(),
  usePublishedBlocks: () => ({
    ...draftQuery(),
    data: queries.isPending || queries.isError ? undefined : queries.published,
  }),
  useSitePublishToken: () => ({
    ...draftQuery(),
    data: queries.isPending || queries.isError ? undefined : queries.token,
  }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const mutateAsync = vi.hoisted(() => vi.fn());
const publishState = vi.hoisted(() => ({ isPending: false }));

// The real PublishConflictError class is kept: the sheet branches on
// `instanceof`, so a stubbed sentinel would let a broken branch pass.
vi.mock('@/hooks/use-publish-site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-publish-site')>();
  return {
    ...actual,
    usePublishSite: () => ({ mutateAsync, isPending: publishState.isPending }),
  };
});

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

// ── harness ────────────────────────────────────────────────────────────────

const PUBLISHED_OK: PublishSiteResult = {
  published: true,
  publishedAt: '2026-07-26T10:00:00.000Z',
  promotedCount: 1,
  retiredCount: 0,
};

interface RenderOptions {
  onOpenChange?: (open: boolean) => void;
  onFixIssue?: (slot: number) => void;
  open?: boolean;
}

function renderSheet({ onOpenChange = vi.fn(), onFixIssue, open = true }: RenderOptions = {}) {
  const element = (
    <PublishSheet
      open={open}
      onOpenChange={onOpenChange}
      communityId={7}
      {...(onFixIssue ? { onFixIssue } : {})}
    />
  );
  const view = render(element);
  return { ...view, element, onOpenChange, onFixIssue };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = DRAFT_ONE_EDIT;
  queries.published = PUBLISHED;
  queries.token = '2026-07-01T00:00:00.000Z';
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
  publishState.isPending = false;
  mutateAsync.mockResolvedValue(PUBLISHED_OK);
});

// ── the change list ────────────────────────────────────────────────────────

describe('PublishSheet — the change list', () => {
  it('lists the pending changes when open', async () => {
    renderSheet();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const group = screen.getByTestId('change-group-site');
    expect(within(group).getByText('Text section')).toBeInTheDocument();
    expect(within(group).getByText('Edited')).toBeInTheDocument();
  });

  it('renders nothing at all while closed, so the blocks query never fires for it', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups changes by group with the site-wide group first', () => {
    const change = (group: string, title: string): Change => ({
      key: 'order',
      kind: 'reordered',
      group,
      title,
      blockType: null,
      fromSlot: null,
      toSlot: null,
    });
    const grouped = groupChanges([
      change('amenities', 'A'),
      change('site', 'B'),
      change('zzz', 'C'),
      change('site', 'D'),
    ]);
    expect(grouped.map((g) => g.group)).toEqual(['site', 'amenities', 'zzz']);
    // Insertion order within a group is preserved.
    expect(grouped[0]!.changes.map((c) => c.title)).toEqual(['B', 'D']);
  });

  it('says so when the site has never been published', () => {
    queries.published = [];
    renderSheet();
    expect(screen.getByText(/first publish/i)).toBeInTheDocument();
  });

  it('shows a staged deletion as a removed section', () => {
    queries.draft = [
      heroBlock(),
      block({ id: 9, blockOrder: 2, blockType: TOMBSTONE_BLOCK_TYPE, content: {}, isDraft: true }),
    ];
    renderSheet();
    const group = screen.getByTestId('change-group-site');
    expect(within(group).getByText('Removed')).toBeInTheDocument();
  });

  it('handles loading and error states', async () => {
    queries.isPending = true;
    const pending = renderSheet();
    expect(await screen.findByText('Loading your changes')).toBeInTheDocument();
    pending.unmount();

    queries.isPending = false;
    queries.isError = true;
    queries.error = new Error('Network down');
    renderSheet();
    expect(await screen.findByText(/couldn't work out what's changed/i)).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });
});

// ── the atomic decision, encoded ───────────────────────────────────────────

describe('PublishSheet — publishing is atomic', () => {
  it('offers no tick boxes, no per-change selection and no select-all', () => {
    renderSheet();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/select all/i)).not.toBeInTheDocument();
  });

  it('says the changes go live together', () => {
    renderSheet();
    expect(screen.getByText(/all-or-nothing/i)).toBeInTheDocument();
  });
});

// ── blocking issues ────────────────────────────────────────────────────────

/** A section whose type this build cannot render — a genuine blocking error. */
const DRAFT_WITH_BLOCKER: SiteBlockSummary[] = [
  heroBlock(),
  block({ id: 3, blockOrder: 3, blockType: 'not_a_real_block', content: {}, isDraft: true }),
];

describe('PublishSheet — blocking issues', () => {
  it('disables Publish and names the offending section', async () => {
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeDisabled();

    const alert = screen.getByRole('alert');
    // Named, not "fix errors": the slot and the offending type are both stated.
    expect(within(alert).getByText('Section 3 (not_a_real_block)')).toBeInTheDocument();
    expect(within(alert).getByText(/not a section type this site can show/i)).toBeInTheDocument();
    expect(screen.getByTestId('publish-hint')).toHaveTextContent(
      /fix the problems above before publishing/i,
    );
  });

  it('never fires a publish request while blocked', async () => {
    const user = userEvent.setup();
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();
    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('"Fix this" closes the sheet and hands the slot back to the editor', async () => {
    const user = userEvent.setup();
    queries.draft = DRAFT_WITH_BLOCKER;
    const onOpenChange = vi.fn();
    const onFixIssue = vi.fn();
    renderSheet({ onOpenChange, onFixIssue });

    await user.click(screen.getByRole('button', { name: /fix this/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onFixIssue).toHaveBeenCalledWith(3);
  });

  it('omits "Fix this" when the editor gave it nowhere to go', () => {
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();
    expect(screen.queryByRole('button', { name: /fix this/i })).not.toBeInTheDocument();
  });
});

// ── nothing to publish ─────────────────────────────────────────────────────

describe('PublishSheet — nothing to publish', () => {
  beforeEach(() => {
    queries.draft = PUBLISHED;
    queries.published = PUBLISHED;
  });

  it('makes publishing impossible rather than a silent no-op request', async () => {
    const user = userEvent.setup();
    renderSheet();

    const publishButton = screen.getByRole('button', { name: /publish changes/i });
    expect(publishButton).toBeDisabled();
    expect(screen.getByTestId('publish-hint')).toHaveTextContent(/nothing to publish yet/i);
    expect(screen.getByText(/matches what's already live/i)).toBeInTheDocument();

    await user.click(publishButton);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

// ── publishing ─────────────────────────────────────────────────────────────

describe('PublishSheet — publishing', () => {
  it('publishes with the authoritative token, toasts, and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      expectedPublishedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(toastSuccess).toHaveBeenCalledWith('Published — 1 section live.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('publish-receipt')).not.toBeInTheDocument();
  });

  it('sends a null token for a first-ever publish rather than inventing one', async () => {
    const user = userEvent.setup();
    queries.published = [];
    queries.token = null;
    renderSheet();
    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ expectedPublishedAt: null });
  });
});

// ── failure receipts ───────────────────────────────────────────────────────

describe('PublishSheet — failure', () => {
  it('reads a 409 as "someone else published", not as a generic failure', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new PublishConflictError('Site changed since load'));
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/someone else published while you were working/i)).toBeInTheDocument();
    expect(within(receipt).getByText(/reload the editor/i)).toBeInTheDocument();
    // Failure must not close the sheet out from under the message.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('renders a persistent receipt that survives a re-render', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Upstream timed out'));
    const { element, rerender } = renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText('Upstream timed out')).toBeInTheDocument();
    expect(within(receipt).getByText(/live site is unchanged/i)).toBeInTheDocument();

    rerender(element);
    expect(screen.getByTestId('publish-receipt')).toBeInTheDocument();
    expect(screen.getByText('Upstream timed out')).toBeInTheDocument();
  });

  it('keeps the receipt until it is dismissed', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Upstream timed out'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    await screen.findByTestId('publish-receipt');

    await user.click(screen.getByRole('button', { name: /dismiss this receipt/i }));
    expect(screen.queryByTestId('publish-receipt')).not.toBeInTheDocument();
  });

  it('leaves a receipt when the server says there was nothing to publish after all', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ published: false, reason: 'nothing-to-publish' });
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/nothing left to publish/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
