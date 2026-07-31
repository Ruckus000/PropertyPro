/**
 * The Add panel — the surface that finally lets a PM create a section in v3.
 *
 * The assertions worth having here are the ones about the slot: it is computed
 * client-side from a list that can be stale, empty-because-loading, or full of
 * tombstones, and every one of those wrong answers silently DESTROYS an
 * existing section (the upsert replaces whatever sits at the target order)
 * rather than failing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import { AddPanel } from '@/components/pm/site-editor-v3/panels/AddPanel';
import {
  SiteEditorProvider,
  useSiteEditor,
  type SiteEditorContextValue,
} from '@/components/pm/site-editor-v3/editor-context';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// `next/dynamic` resolves its import asynchronously, which would make the
// image flow untestable here. AddImageFlow has its own test file.
vi.mock('next/dynamic', () => ({
  default: () =>
    // Props are forwarded onto the stub so the page id the panel hands the
    // upload flow is observable. Without that, `pageId` could be dropped on the
    // image path and no test in this file would notice — and the image path is
    // the one that writes AFTER an upload, so a wrong page there also strands
    // the bytes.
    function DynamicStub(props: { blockOrder: number | null; pageId: number | null }) {
      return (
        <div
          data-testid="add-image-flow"
          data-block-order={String(props.blockOrder)}
          data-page-id={String(props.pageId)}
        />
      );
    },
}));

const upsertMutateAsync = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  blocks: [] as SiteBlockSummary[],
  isPending: false,
  isError: false,
  upsertPending: false,
}));

// Mocked COMPLETELY, per this directory's convention: a partial factory fails
// at module load for whichever component reaches the missing export, and reads
// as an unrelated component breaking.
function base() {
  return { isPending: state.isPending, isError: state.isError, error: null, refetch: vi.fn() };
}
vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({
    ...base(),
    data: state.isPending || state.isError ? undefined : state.blocks,
  }),
  usePublishedBlocks: () => ({ ...base(), data: [] }),
  useSitePublishToken: () => ({ ...base(), data: null }),
  useUpsertContentBlock: () => ({
    mutate: vi.fn(),
    mutateAsync: upsertMutateAsync,
    isPending: state.upsertPending,
  }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

/** The two pages the page-scope cases use. */
const HOME_PAGE_ID = 10;
const ABOUT_PAGE_ID = 11;

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: overrides.id,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

let api: SiteEditorContextValue;
function Probe() {
  api = useSiteEditor();
  return null;
}

function renderPanel({
  hasPolishBlocks = true,
  onSelect,
  pageId = HOME_PAGE_ID,
}: {
  hasPolishBlocks?: boolean;
  onSelect?: (id: number) => void;
  pageId?: number | null;
} = {}) {
  return render(
    <SelectedSitePageProvider pageId={pageId}>
      <SiteEditorProvider communityId={7} blocks={state.blocks} onSelect={onSelect}>
        <AddPanel communityId={7} hasPolishBlocks={hasPolishBlocks} />
        <Probe />
      </SiteEditorProvider>
    </SelectedSitePageProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.blocks = [block({ id: 1, blockType: 'hero', blockOrder: 1 })];
  state.isPending = false;
  state.isError = false;
  state.upsertPending = false;
  upsertMutateAsync.mockResolvedValue(undefined);
});

describe('AddPanel', () => {
  it('offers every addable type and never the hero', () => {
    renderPanel();
    for (const type of [
      'text',
      'image',
      'announcements',
      'documents',
      'meetings',
      'contact',
      'faq',
      'gallery',
      'amenities',
      'payments',
    ]) {
      expect(screen.getByTestId(`add-section-${type}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('add-section-hero')).not.toBeInTheDocument();
  });

  it('writes seeded content at the next free slot', async () => {
    state.blocks = [
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 2, blockType: 'text', blockOrder: 2 }),
    ];
    renderPanel();

    await userEvent.click(screen.getByTestId('add-section-text'));

    expect(upsertMutateAsync).toHaveBeenCalledWith({
      blockType: 'text',
      blockOrder: 3,
      content: expect.objectContaining({ body: expect.any(String) }),
      pageId: HOME_PAGE_ID,
    });
  });

  it('does not reuse a tombstoned slot', async () => {
    // THE regression. A tombstone is a staged deletion that still occupies its
    // slot; the upsert soft-deletes whatever draft sits there, so writing over
    // one cancels the removal and republishes a section the PM deleted.
    // `movableSections` filters tombstones out, which is why the panel reads
    // the raw block list instead.
    state.blocks = [
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 2, blockType: 'text', blockOrder: 2 }),
      block({ id: 3, blockType: TOMBSTONE_BLOCK_TYPE, blockOrder: 3 }),
    ];
    renderPanel();

    await userEvent.click(screen.getByTestId('add-section-text'));

    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ blockOrder: 4 }),
    );
  });

  it('disables every type while the block list is loading', () => {
    // The panel reads `useContentBlocks` itself precisely so it can tell these
    // apart: collapsing `undefined` to `[]` makes loading look exactly like an
    // empty site — and the slot for an empty site is 2, which would overwrite
    // whatever really sits there.
    state.isPending = true;
    renderPanel();
    expect(screen.getByTestId('add-section-text')).toBeDisabled();
  });

  it('disables every type and explains itself when the list failed to load', () => {
    state.isError = true;
    renderPanel();
    expect(screen.getByTestId('add-section-text')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load/i);
  });

  it('disables every type while a write is in flight', () => {
    // Two clicks before the refetch lands compute the same slot, and the
    // second write replaces the first section.
    state.upsertPending = true;
    renderPanel();
    expect(screen.getByTestId('add-section-text')).toBeDisabled();
    expect(screen.getByTestId('add-section-payments')).toBeDisabled();
  });

  it('refuses to add when every content slot is taken', () => {
    state.blocks = [block({ id: 1, blockType: 'hero', blockOrder: 1 })];
    for (let slot = 2; slot <= 99; slot += 1) {
      state.blocks.push(block({ id: slot, blockOrder: slot }));
    }
    renderPanel();
    expect(screen.getByTestId('add-section-text')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/full/i);
  });

  describe('Pro gating', () => {
    it('shows polish blocks disabled with an upsell rather than hiding them', () => {
      renderPanel({ hasPolishBlocks: false });

      for (const type of ['faq', 'gallery', 'amenities']) {
        const button = screen.getByTestId(`add-section-${type}`);
        expect(button).toBeInTheDocument();
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', expect.stringMatching(/Upgrade to Professional/));
      }
      // Essentials types stay available.
      expect(screen.getByTestId('add-section-text')).toBeEnabled();
      expect(screen.getByTestId('add-section-contact')).toBeEnabled();
    });

    it('enables polish blocks on a Pro plan', () => {
      renderPanel({ hasPolishBlocks: true });
      expect(screen.getByTestId('add-section-faq')).toBeEnabled();
    });
  });

  describe('after a successful add', () => {
    it('selects the new slot once the row arrives, without switching tabs', async () => {
      // `onSelect` pulls the Sections panel forward, which would unmount this
      // panel the moment a section is added. `selectSlot` deliberately skips it.
      const onSelect = vi.fn();
      state.blocks = [block({ id: 1, blockType: 'hero', blockOrder: 1 })];
      const { rerender } = renderPanel({ onSelect });

      await userEvent.click(screen.getByTestId('add-section-payments'));

      // Anchored on the slot before the refetch has produced a row for it.
      expect(onSelect).not.toHaveBeenCalled();

      const withNew = [
        block({ id: 1, blockType: 'hero', blockOrder: 1 }),
        block({ id: 55, blockType: 'payments', blockOrder: 2 }),
      ];
      state.blocks = withNew;
      rerender(
        <SelectedSitePageProvider pageId={HOME_PAGE_ID}>
          <SiteEditorProvider communityId={7} blocks={withNew} onSelect={onSelect}>
            <AddPanel communityId={7} hasPolishBlocks />
            <Probe />
          </SiteEditorProvider>
        </SelectedSitePageProvider>,
      );

      await waitFor(() => expect(api.selection?.blockId).toBe(55));
      expect(api.selection?.blockType).toBe('payments');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('announces the addition', async () => {
      renderPanel();
      await userEvent.click(screen.getByTestId('add-section-documents'));
      // Two status regions are in the tree: the provider's (reorders) and this
      // panel's (additions). They never fire together, so asserting that one
      // of them carries the message is the right shape.
      await waitFor(() =>
        expect(
          screen.getAllByRole('status').map((node) => node.textContent).join(' '),
        ).toMatch(/Documents section added/i),
      );
    });
  });

  it('surfaces a rejected write and clears it on the next attempt', async () => {
    upsertMutateAsync.mockRejectedValueOnce(
      new Error('Your plan does not include this feature.'),
    );
    renderPanel();

    await userEvent.click(screen.getByTestId('add-section-faq'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/plan does not include/i),
    );

    upsertMutateAsync.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByTestId('add-section-faq'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('routes image and gallery through the upload flow instead of writing', async () => {
    renderPanel();
    await userEvent.click(screen.getByTestId('add-section-image'));

    expect(screen.getByTestId('add-image-flow')).toBeInTheDocument();
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });

  describe('page targeting', () => {
    it('computes the next slot from every page, not just the selected one', async () => {
      // D-C3, and the single most dangerous correction in the phase. `block_order`
      // is unique across the WHOLE community until 11c drops the surviving
      // 3-column index, so the slot allocator must see every page's blocks.
      // Narrowing it to the selected page — which reads like the obvious fix for a
      // cross-page collision — returns `max(this page) + 1`, here 3, which the
      // home page already holds. That write is refused by
      // `assertSlotFreeAcrossPages`, and before that guard existed it was an
      // opaque 500. Scanning every page is what makes the answer free.
      //
      // The fixture is built so the two answers DIFFER — the About page's
      // highest slot is 5 but the home page runs on to 6, so page-filtering
      // yields 6 (taken) and scanning every page yields 7 (free). A fixture
      // where the selected page happens to hold the highest slot passes either
      // way and proves nothing.
      state.blocks = [
        block({ id: 1, blockType: 'hero', blockOrder: 1 }),
        block({ id: 2, blockOrder: 2 }),
        block({ id: 3, blockOrder: 3 }),
        block({ id: 5, pageId: ABOUT_PAGE_ID, blockOrder: 5 }),
        block({ id: 6, blockOrder: 6 }),
      ];
      renderPanel({ pageId: ABOUT_PAGE_ID });

      await userEvent.click(screen.getByTestId('add-section-text'));

      expect(upsertMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ blockOrder: 7 }),
      );
      // 6 is `max(About) + 1`, which is what a page-filtered allocator returns —
      // and the home page is sitting on it.
      expect(upsertMutateAsync).not.toHaveBeenCalledWith(
        expect.objectContaining({ blockOrder: 6 }),
      );
    });

    it('writes to the selected page, not the home page', async () => {
      // D-WRITE. The server defaults an ABSENT pageId to the community's HOME
      // page, so a write that omits it does not fail — it silently rewrites the
      // live home page. The override is passed explicitly rather than left to the
      // hook's default because "page being added to" and "page selected" are the
      // same value by coincidence, not by contract.
      state.blocks = [
        block({ id: 1, blockType: 'hero', blockOrder: 1 }),
        block({ id: 2, pageId: ABOUT_PAGE_ID, blockOrder: 2 }),
      ];
      renderPanel({ pageId: ABOUT_PAGE_ID });

      await userEvent.click(screen.getByTestId('add-section-documents'));

      expect(upsertMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pageId: ABOUT_PAGE_ID }),
      );
    });

    it('hands the image flow the same page it would write itself', async () => {
      renderPanel({ pageId: ABOUT_PAGE_ID });
      await userEvent.click(screen.getByTestId('add-section-image'));

      expect(screen.getByTestId('add-image-flow')).toHaveAttribute(
        'data-page-id',
        String(ABOUT_PAGE_ID),
      );
    });

    it('falls back to the server default when no page is selected', async () => {
      // `null` is what a provider that has not resolved a page yet supplies, and
      // what `useSelectedSitePage` returns outside a provider. It must reproduce
      // the pre-11b-3 behaviour rather than throw.
      renderPanel({ pageId: null });

      await userEvent.click(screen.getByTestId('add-section-documents'));

      expect(upsertMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pageId: null }),
      );
    });
  });
});
