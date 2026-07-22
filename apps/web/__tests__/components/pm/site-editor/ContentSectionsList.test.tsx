import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { ContentSectionsList } from '@/components/pm/site-editor/ContentSectionsList';

vi.mock('@/components/pm/site-editor/TextBlockForm', () => ({
  TextBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="text-form" data-block-order={props.blockOrder}>text form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/ImageBlockForm', () => ({
  ImageBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="image-form" data-block-order={props.blockOrder}>image form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/AnnouncementsBlockForm', () => ({
  AnnouncementsBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="announcements-form" data-block-order={props.blockOrder}>announcements form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/DocumentsBlockForm', () => ({
  DocumentsBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="documents-form" data-block-order={props.blockOrder}>documents form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/MeetingsBlockForm', () => ({
  MeetingsBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="meetings-form" data-block-order={props.blockOrder}>meetings form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/ContactBlockForm', () => ({
  ContactBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="contact-form" data-block-order={props.blockOrder}>contact form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/FaqBlockForm', () => ({
  FaqBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="faq-form" data-block-order={props.blockOrder}>faq form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/AmenitiesBlockForm', () => ({
  AmenitiesBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="amenities-form" data-block-order={props.blockOrder}>amenities form</div>
  ),
}));
vi.mock('@/components/pm/site-editor/GalleryBlockForm', () => ({
  GalleryBlockForm: (props: { blockOrder: number; initial: unknown }) => (
    <div data-testid="gallery-form" data-block-order={props.blockOrder}>gallery form</div>
  ),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function mockBlocks(blocks: object[]) {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { blocks } }),
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('<ContentSectionsList>', () => {
  it('shows loading message while blocks are being fetched', () => {
    // Never resolve
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(wrap(<ContentSectionsList communityId={42} />));
    expect(screen.getByText(/loading content sections/i)).toBeInTheDocument();
  });

  it('shows empty state and all 6 Add buttons when there are no content blocks', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    expect(await screen.findByText(/no content sections yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add text section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add image section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add announcements section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add documents section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add meetings section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add contact section/i })).toBeInTheDocument();
  });

  it('renders a TextBlockForm for an existing text block', async () => {
    mockBlocks([
      { id: 10, blockType: 'text', blockOrder: 2, content: { body: 'Hello', heading: 'Hi' } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('text-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '2');
  });

  it('renders an ImageBlockForm for an existing image block', async () => {
    mockBlocks([
      { id: 11, blockType: 'image', blockOrder: 3, content: { imagePath: '/img.webp', altText: 'A photo' } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('image-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '3');
  });

  it('filters out hero blocks — they do not appear in the list', async () => {
    mockBlocks([
      { id: 1, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    // hero block excluded — empty state message visible
    expect(await screen.findByText(/no content sections yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('text-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-form')).not.toBeInTheDocument();
  });

  it('clicking "Add text section" reveals a new TextBlockForm', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    // Wait for empty state to appear (query resolved)
    await screen.findByText(/no content sections yet/i);

    fireEvent.click(screen.getByRole('button', { name: /add text section/i }));
    expect(screen.getByTestId('text-form')).toBeInTheDocument();
    // blockOrder should be HERO_BLOCK_ORDER + 1 = 2 since no existing content blocks
    expect(screen.getByTestId('text-form')).toHaveAttribute('data-block-order', '2');
  });

  it('renders an AnnouncementsBlockForm for an existing announcements block', async () => {
    mockBlocks([
      { id: 12, blockType: 'announcements', blockOrder: 4, content: { limit: 5, timeWindowDays: 30 } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('announcements-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '4');
  });

  it('clicking "+ Add announcements section" reveals a new AnnouncementsBlockForm', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);

    fireEvent.click(screen.getByRole('button', { name: /add announcements section/i }));
    expect(screen.getByTestId('announcements-form')).toBeInTheDocument();
    expect(screen.getByTestId('announcements-form')).toHaveAttribute('data-block-order', '2');
  });

  it('shows error alert when the fetch fails', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server exploded' } }),
    });
    render(wrap(<ContentSectionsList communityId={42} />));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server exploded');
  });

  it('renders a DocumentsBlockForm for an existing documents block', async () => {
    mockBlocks([
      { id: 13, blockType: 'documents', blockOrder: 5, content: { limit: 5, includeCategories: ['budget'] } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('documents-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '5');
  });

  it('renders a MeetingsBlockForm for an existing meetings block', async () => {
    mockBlocks([
      { id: 14, blockType: 'meetings', blockOrder: 6, content: { limit: 10, timeWindowDays: 30 } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('meetings-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '6');
  });

  it('renders a ContactBlockForm for an existing contact block', async () => {
    mockBlocks([
      { id: 15, blockType: 'contact', blockOrder: 7, content: { showBoard: true, showManagement: true } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    const form = await screen.findByTestId('contact-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-block-order', '7');
  });

  it('clicking "+ Add documents section" reveals a new DocumentsBlockForm', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);

    fireEvent.click(screen.getByRole('button', { name: /add documents section/i }));
    expect(screen.getByTestId('documents-form')).toBeInTheDocument();
    expect(screen.getByTestId('documents-form')).toHaveAttribute('data-block-order', '2');
  });

  it('clicking "+ Add meetings section" reveals a new MeetingsBlockForm', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);

    fireEvent.click(screen.getByRole('button', { name: /add meetings section/i }));
    expect(screen.getByTestId('meetings-form')).toBeInTheDocument();
    expect(screen.getByTestId('meetings-form')).toHaveAttribute('data-block-order', '2');
  });

  it('clicking "+ Add contact section" reveals a new ContactBlockForm', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);

    fireEvent.click(screen.getByRole('button', { name: /add contact section/i }));
    expect(screen.getByTestId('contact-form')).toBeInTheDocument();
    expect(screen.getByTestId('contact-form')).toHaveAttribute('data-block-order', '2');
  });

  // --- Pro+ polish blocks (faq / amenities), gated by hasSitePolishBlocks ---

  it('disables the FAQ and Amenities add buttons when hasSitePolishBlocks is absent (upsell)', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);
    expect(screen.getByRole('button', { name: /add faq section/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /add amenities section/i })).toBeDisabled();
  });

  it('enables the FAQ and Amenities add buttons when hasSitePolishBlocks is true', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    await screen.findByText(/no content sections yet/i);
    expect(screen.getByRole('button', { name: /add faq section/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /add amenities section/i })).not.toBeDisabled();
  });

  it('clicking "+ Add FAQ section" reveals a new FaqBlockForm when enabled', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    await screen.findByText(/no content sections yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add faq section/i }));
    expect(screen.getByTestId('faq-form')).toBeInTheDocument();
    expect(screen.getByTestId('faq-form')).toHaveAttribute('data-block-order', '2');
  });

  it('clicking "+ Add amenities section" reveals a new AmenitiesBlockForm when enabled', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    await screen.findByText(/no content sections yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add amenities section/i }));
    expect(screen.getByTestId('amenities-form')).toBeInTheDocument();
    expect(screen.getByTestId('amenities-form')).toHaveAttribute('data-block-order', '2');
  });

  it('renders a FaqBlockForm for an existing faq block', async () => {
    mockBlocks([
      { id: 16, blockType: 'faq', blockOrder: 8, content: { items: [{ question: 'Q', answer: 'A' }] } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    const form = await screen.findByTestId('faq-form');
    expect(form).toHaveAttribute('data-block-order', '8');
  });

  it('renders an AmenitiesBlockForm for an existing amenities block', async () => {
    mockBlocks([
      { id: 17, blockType: 'amenities', blockOrder: 9, content: { items: [{ name: 'Pool' }] } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    const form = await screen.findByTestId('amenities-form');
    expect(form).toHaveAttribute('data-block-order', '9');
  });

  it('disables the Gallery add button when hasSitePolishBlocks is absent (upsell)', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByText(/no content sections yet/i);
    expect(screen.getByRole('button', { name: /add gallery section/i })).toBeDisabled();
  });

  it('clicking "+ Add gallery section" reveals a new GalleryBlockForm when enabled', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    await screen.findByText(/no content sections yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add gallery section/i }));
    expect(screen.getByTestId('gallery-form')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-form')).toHaveAttribute('data-block-order', '2');
  });

  it('renders a GalleryBlockForm for an existing gallery block', async () => {
    mockBlocks([
      { id: 18, blockType: 'gallery', blockOrder: 10, content: { images: [{ imagePath: '42/content/a.webp', altText: 'A' }] } },
    ]);
    render(wrap(<ContentSectionsList communityId={42} hasSitePolishBlocks />));
    const form = await screen.findByTestId('gallery-form');
    expect(form).toHaveAttribute('data-block-order', '10');
  });
});

describe('<ContentSectionsList> reorder controls', () => {
  // Always-resolving fetch returning the given blocks. The initial GET, the
  // reorder POST (which only checks res.ok), and the post-settle refetch all
  // read this shape harmlessly.
  function mockFetchWithBlocks(blocks: object[]) {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { blocks, ok: true } }),
    });
  }

  const TWO_BLOCKS = [
    { id: 10, blockType: 'text', blockOrder: 2, content: { body: 'A' } },
    { id: 11, blockType: 'image', blockOrder: 3, content: { imagePath: '/b.webp', altText: 'B' } },
  ];

  it('renders keyboard-accessible Move up / Move down buttons for each content block', async () => {
    mockFetchWithBlocks(TWO_BLOCKS);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    const ups = screen.getAllByRole('button', { name: /move .* up/i });
    const downs = screen.getAllByRole('button', { name: /move .* down/i });
    expect(ups).toHaveLength(2);
    expect(downs).toHaveLength(2);
  });

  it('disables Move up on the first block and Move down on the last block', async () => {
    mockFetchWithBlocks(TWO_BLOCKS);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    const ups = screen.getAllByRole('button', { name: /move .* up/i });
    const downs = screen.getAllByRole('button', { name: /move .* down/i });
    // First block (order 2): up disabled, down enabled.
    expect(ups[0]).toBeDisabled();
    expect(downs[0]).not.toBeDisabled();
    // Last block (order 3): up enabled, down disabled.
    expect(ups[1]).not.toBeDisabled();
    expect(downs[1]).toBeDisabled();
  });

  it('clicking Move down POSTs the reorder request with the block id and direction', async () => {
    mockFetchWithBlocks(TWO_BLOCKS);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    const downs = screen.getAllByRole('button', { name: /move .* down/i });
    fireEvent.click(downs[0]); // move the first block (id 10) down

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/pm/site/blocks/reorder',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const reorderCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/v1/pm/site/blocks/reorder',
    )!;
    expect(JSON.parse(reorderCall[1].body as string)).toEqual({
      communityId: 42,
      blockId: 10,
      direction: 'down',
    });
  });

  it('clicking Move up on the second block POSTs direction "up" with its id', async () => {
    mockFetchWithBlocks(TWO_BLOCKS);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    const ups = screen.getAllByRole('button', { name: /move .* up/i });
    fireEvent.click(ups[1]); // move the second block (id 11) up

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/pm/site/blocks/reorder',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const reorderCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/v1/pm/site/blocks/reorder',
    )!;
    expect(JSON.parse(reorderCall[1].body as string)).toMatchObject({ blockId: 11, direction: 'up' });
  });

  it('does not render reorder buttons when there is only one content block (nothing to swap)', async () => {
    mockFetchWithBlocks([{ id: 20, blockType: 'text', blockOrder: 2, content: { body: 'only' } }]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');
    // A lone block can't move in either direction — both controls disabled.
    expect(screen.getByRole('button', { name: /move .* up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move .* down/i })).toBeDisabled();
  });
});

describe('<ContentSectionsList> — remove section (slice 8f)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  const TWO_BLOCKS = [
    { id: 10, blockType: 'text', blockOrder: 2, content: { body: 'A' }, isDraft: false, publishedAt: '2026-05-01T00:00:00Z' },
    { id: 11, blockType: 'image', blockOrder: 3, content: { imagePath: '42/content/x.webp', altText: 'x' }, isDraft: false, publishedAt: '2026-05-01T00:00:00Z' },
  ];

  it('renders a Remove button for each content section', async () => {
    mockBlocks(TWO_BLOCKS);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');
    expect(screen.getByRole('button', { name: /remove text section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove image section/i })).toBeInTheDocument();
  });

  it('confirms, then DELETEs /api/v1/pm/site/blocks with { communityId, blockOrder }', async () => {
    mockBlocks(TWO_BLOCKS);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true, staged: true } }),
    });
    // Refetch after invalidation.
    mockBlocks(TWO_BLOCKS);

    fireEvent.click(screen.getByRole('button', { name: /remove text section/i }));
    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      const deleteCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[1]?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![0]).toBe('/api/v1/pm/site/blocks');
      expect(JSON.parse(deleteCall![1].body as string)).toEqual({ communityId: 42, blockOrder: 2 });
    });
    confirmSpy.mockRestore();
  });

  it('does nothing when the confirm dialog is cancelled', async () => {
    mockBlocks(TWO_BLOCKS);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');

    fireEvent.click(screen.getByRole('button', { name: /remove text section/i }));

    const deleteCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === 'DELETE',
    );
    expect(deleteCall).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it('never renders tombstone rows (staged deletions are invisible in the editor list)', async () => {
    mockBlocks([
      ...TWO_BLOCKS,
      { id: 90, blockType: 'tombstone', blockOrder: 4, content: {}, isDraft: true, publishedAt: null },
    ]);
    render(wrap(<ContentSectionsList communityId={42} />));
    await screen.findByTestId('text-form');
    expect(screen.queryByText(/tombstone/i)).not.toBeInTheDocument();
    // Only the two visible sections get remove buttons.
    expect(screen.getAllByRole('button', { name: /remove .* section/i })).toHaveLength(2);
  });
});
