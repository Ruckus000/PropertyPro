import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('shows empty state and Add buttons when there are no text/image blocks', async () => {
    mockBlocks([]);
    render(wrap(<ContentSectionsList communityId={42} />));
    expect(await screen.findByText(/no content sections yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add text section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add image section/i })).toBeInTheDocument();
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
});
