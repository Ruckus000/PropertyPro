/**
 * The EditorRoot → EditorShell seam.
 *
 * This file exists because of a specific production bug: the Publish button was
 * disabled for every PM, for every state, because `EditorRoot` never passed the
 * pending-change prop and both `EditorShell` and `EditorTopBar` defaulted it to
 * a value meaning "nothing to publish". The shell's own tests were green
 * throughout — they pass the prop explicitly, so they assert the shell's
 * contract in isolation and can never see the composition failing.
 *
 * So the assertions here run the REAL `useSiteDiff`, `diffSite` and
 * `toSnapshot` against mocked query data. Mocking `use-site-diff` would recreate
 * exactly the blind spot this file is for.
 *
 * `@/hooks/use-content-blocks` is mocked COMPLETELY — a partial factory fails
 * only at module load for whichever component reaches the missing export, and
 * reads as an unrelated component breaking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditorRoot } from '@/components/pm/site-editor-v3/EditorRoot';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// Every code-split child (preview, publish sheet, notice/site panels,
// inspector) renders nothing — this file is about the top bar, and mounting
// them would drag in their own query surfaces.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));

// The shell asks `(max-width: 767px)`: false = desktop. True would render the
// phone gate and there would be no top bar to assert on.
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => false,
  useIsDesktop: () => true,
}));

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

const hero = (overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary =>
  block({
    id: 100,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Sunset Condos', subtitle: 'Miami Beach' },
    ...overrides,
  });

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

function base() {
  return {
    isPending: queries.isPending,
    isError: queries.isError,
    error: queries.error,
    refetch: vi.fn(),
  };
}

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.draft,
  }),
  usePublishedBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.published,
  }),
  useSitePublishToken: () => ({ ...base(), data: null }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

function renderRoot() {
  return render(
    <EditorRoot
      communityId={42}
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      proToolAccess={{ styling: true, domain: true }}
      // Null on purpose: takes the degraded-canvas branch, so the whole
      // block-view tree stays out of this test.
      canvasContext={null}
      hasPublishedSite
      initialNotice={null}
      siteIdentity={{
        name: 'Sunset Condos',
        slug: 'sunset-condos',
        communityType: 'condo_718',
        city: 'Miami',
      }}
      tagline={null}
      initialSiteSettings={undefined}
    />,
  );
}

function publishButton() {
  return screen.getByRole('button', { name: /Publish/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = [];
  queries.published = [];
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
});

describe('EditorRoot — Publish button wiring', () => {
  it('enables Publish when the draft differs from what is live', () => {
    // The regression test. This is the ordinary case a PM hits every session,
    // and it was broken in production.
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [
      hero(),
      block({
        id: 2,
        isDraft: true,
        publishedAt: null,
        content: { heading: 'Pool rules', body: 'No glass, and no diving.' },
      }),
    ];

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });

  it('disables Publish with an explanation when the draft matches what is live', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [hero(), block({ id: 1 })];

    renderRoot();

    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAttribute('title', 'Nothing to publish yet');
  });

  it('enables Publish on a never-published site that has draft content', () => {
    queries.published = [];
    queries.draft = [hero({ isDraft: true, publishedAt: null })];

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });

  it('disables Publish while the change model is still loading', () => {
    queries.isPending = true;

    renderRoot();

    expect(publishButton()).toBeDisabled();
  });

  it('enables Publish when the change model fails to load', () => {
    // The sheet is the only surface that can explain the failure and offer a
    // retry, so a load error must not lock the PM out of opening it.
    queries.isError = true;
    queries.error = new Error('Network is down');

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });
});
