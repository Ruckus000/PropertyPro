/**
 * Which PAGE does an in-flight inspector edit land on when the PM switches page?
 *
 * The answer is "the one they were editing", and **D-SEL's `key` is what makes
 * that true** — which is not obvious, because the key was chosen to reset the
 * canvas selection, not to protect a write.
 *
 * **Read this next sentence before trusting anything below.** The `key` this
 * file's harness carries is its OWN `<div key={pageId}>`, not the product's.
 * So nothing here can prove the product still has one: delete
 * `key={effectivePageId ?? 'none'}` from `EditorRoot.tsx` and every case in
 * this file stays green. That half is guarded in `EditorRoot.test.tsx`
 * ("UNMOUNTS the inspector on a page switch, which is what targets a pending
 * write"), which drives the real tree. Neither file is sufficient alone, and
 * asserting a `key` defined in a test's own harness while believing it
 * asserted the product's is the exact mistake that produced a HIGH in review
 * round 4. What this file proves is the CONSEQUENCE — given an unmount, the
 * flush carries the pre-switch page id.
 *
 * `useUpsertContentBlock` calls `useSelectedSitePage()` at RENDER time and its
 * `mutationFn` closes over that value (`use-content-blocks.ts`). With
 * `key={effectivePageId}` the outgoing subtree is UNMOUNTED rather than
 * re-rendered, so `use-block-form`'s unmount cleanup flushes through a closure
 * still holding the OLD page id. Take the key away and nothing unmounts: the
 * form re-renders under the NEW id and the pending debounce fires against it,
 * silently rewriting page B's section with an edit made on page A — no error,
 * and a "Saved" indicator.
 *
 * (An earlier version of this file claimed the guarantee came from
 * `SelectedSitePageProvider` sitting outside the key. It does not: moving the
 * provider inside the key changes nothing, because the cleanup closure is
 * captured either way. That version passed under both arrangements and proved
 * nothing. The `key` is the load-bearing part.)
 *
 * `use-block-form-unmount.test.tsx` covers a DIFFERENT seam (that the flush
 * happens at all). This one covers what it carries.
 *
 * Built from the real `SelectedSitePageProvider`, the real `useBlockForm` and
 * the real `useUpsertContentBlock`, with only `fetch` stubbed — mounting the
 * actual `Inspector` would drag in the whole form registry without testing
 * anything more.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '@/components/pm/site-editor-v3/inspector/use-block-form';

const HOME_PAGE_ID = 5;
const SECOND_PAGE_ID = 77;
const DELAY = 800;

interface Draft {
  heading: string;
}

/** Stands in for one inspector form: a draft, and a debounced write. */
function FormUnderTest({ onReady }: { onReady: (setDraft: (d: Draft) => void) => void }) {
  const upsert = useUpsertContentBlock(42);
  const form = useBlockForm<Draft>({
    content: { heading: 'Before' },
    toDraft: (raw) => ({
      heading: typeof (raw as Draft | null)?.heading === 'string' ? (raw as Draft).heading : '',
    }),
    toCanonical: (draft) => (draft.heading.length === 0 ? null : { heading: draft.heading }),
    save: (content) =>
      upsert.mutateAsync({ blockType: 'text', blockOrder: 2, content }),
  });
  onReady(form.setDraft);
  return null;
}

/**
 * The editor's real shape: the page provider ABOVE, the keyed subtree BELOW.
 * Both move together on a page switch, which is the whole point.
 */
function Harness({
  pageId,
  onReady,
}: {
  pageId: number;
  onReady: (setDraft: (d: Draft) => void) => void;
}) {
  return (
    <SelectedSitePageProvider pageId={pageId}>
      <div key={pageId}>
        <FormUnderTest onReady={onReady} />
      </div>
    </SelectedSitePageProvider>
  );
}

function bodyOf(call: unknown[]): { pageId?: number; content?: unknown } {
  return JSON.parse((call[1] as RequestInit).body as string) as {
    pageId?: number;
    content?: unknown;
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderHarness(pageId: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let setDraft: (d: Draft) => void = () => {};
  const view = render(
    <QueryClientProvider client={client}>
      <Harness pageId={pageId} onReady={(fn) => (setDraft = fn)} />
    </QueryClientProvider>,
  );
  const rerenderWith = (next: number) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <Harness pageId={next} onReady={(fn) => (setDraft = fn)} />
      </QueryClientProvider>,
    );
  return { ...view, rerenderWith, setDraft: (d: Draft) => setDraft(d) };
}

describe('a page switch while an inspector edit is still pending', () => {
  it('writes to the page the PM was editing, not the one they switched to', async () => {
    const { rerenderWith, setDraft } = renderHarness(HOME_PAGE_ID);

    // Type, and stop short of the debounce firing.
    act(() => setDraft({ heading: 'Edited on home' }));
    await act(async () => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Switch page: the provider takes the new id and the keyed subtree unmounts.
    await act(async () => {
      rerenderWith(SECOND_PAGE_ID);
    });

    // Past the debounce as well, which is what makes this bite rather than
    // merely notice. Drop the `key` and nothing unmounts, so no flush happens
    // here — instead the form RE-RENDERS under the new page id, and the pending
    // debounce fires below carrying SECOND_PAGE_ID. That is the silent
    // cross-page write, and asserting the id (not just the call count) is what
    // catches it.
    await act(async () => {
      vi.advanceTimersByTime(DELAY * 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock.mock.calls[0] as unknown[]);
    expect(body.pageId).toBe(HOME_PAGE_ID);
    expect(body.content).toEqual({ heading: 'Edited on home' });
  });

  it('writes to the selected page when no switch happened', async () => {
    // The control. Without it the case above would also pass on an
    // implementation that always sent HOME_PAGE_ID for some unrelated reason.
    const { setDraft } = renderHarness(SECOND_PAGE_ID);

    act(() => setDraft({ heading: 'Edited on the second page' }));
    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0] as unknown[]).pageId).toBe(SECOND_PAGE_ID);
  });
});
