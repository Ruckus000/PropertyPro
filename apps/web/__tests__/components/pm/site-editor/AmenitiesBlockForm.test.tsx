import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { AmenitiesBlockForm } from '@/components/pm/site-editor/AmenitiesBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<AmenitiesBlockForm>', () => {
  it('renders a heading input and one empty amenity row by default', () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByLabelText(/heading/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amenity 1 name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amenity 1 description/i)).toBeInTheDocument();
  });

  it('disables Save when an amenity name is empty', () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save once every amenity has a name (description optional)', async () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={2} initial={null} />));
    await userEvent.type(screen.getByLabelText(/amenity 1 name/i), 'Pool');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('adds an amenity row when "Add amenity" is clicked', () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={2} initial={null} />));
    fireEvent.click(screen.getByRole('button', { name: /add amenity/i }));
    expect(screen.getByLabelText(/amenity 2 name/i)).toBeInTheDocument();
  });

  it('pre-fills from the initial prop', () => {
    render(
      wrap(
        <AmenitiesBlockForm
          communityId={42}
          blockOrder={2}
          initial={{ heading: 'Amenities', items: [{ name: 'Gym', description: 'Open 24/7' }] }}
        />,
      ),
    );
    expect(screen.getByLabelText(/heading/i)).toHaveValue('Amenities');
    expect(screen.getByLabelText(/amenity 1 name/i)).toHaveValue('Gym');
    expect(screen.getByLabelText(/amenity 1 description/i)).toHaveValue('Open 24/7');
  });

  it('submits PATCH with blockType amenities, omitting empty descriptions', async () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={4} initial={null} />));
    await userEvent.type(screen.getByLabelText(/amenity 1 name/i), 'Clubhouse');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    const body = JSON.parse(init.body as string);
    expect(body.blockType).toBe('amenities');
    expect(body.blockOrder).toBe(4);
    expect(body.content).toEqual({ items: [{ name: 'Clubhouse' }] });
  });

  it('includes the description when provided', async () => {
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={4} initial={null} />));
    await userEvent.type(screen.getByLabelText(/amenity 1 name/i), 'Pool');
    await userEvent.type(screen.getByLabelText(/amenity 1 description/i), 'Heated.');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.content).toEqual({ items: [{ name: 'Pool', description: 'Heated.' }] });
  });

  it('surfaces a server error as an inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'PLAN_UPGRADE_REQUIRED', message: 'Upgrade required.' } }),
    });
    render(wrap(<AmenitiesBlockForm communityId={42} blockOrder={2} initial={null} />));
    await userEvent.type(screen.getByLabelText(/amenity 1 name/i), 'Pool');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Upgrade required.'));
  });
});
