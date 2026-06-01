import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { FaqBlockForm } from '@/components/pm/site-editor/FaqBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<FaqBlockForm>', () => {
  it('renders a heading input and one empty question row by default', () => {
    render(wrap(<FaqBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByLabelText(/heading/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/question 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/answer 1/i)).toBeInTheDocument();
  });

  it('disables Save when a question or answer is empty', () => {
    render(wrap(<FaqBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save once every item has a question and an answer', async () => {
    render(wrap(<FaqBlockForm communityId={42} blockOrder={2} initial={null} />));
    await userEvent.type(screen.getByLabelText(/question 1/i), 'When are meetings?');
    await userEvent.type(screen.getByLabelText(/answer 1/i), 'Quarterly.');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('adds a question row when "Add question" is clicked', () => {
    render(wrap(<FaqBlockForm communityId={42} blockOrder={2} initial={null} />));
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    expect(screen.getByLabelText(/question 2/i)).toBeInTheDocument();
  });

  it('removes a question row when "Remove" is clicked', () => {
    render(
      wrap(
        <FaqBlockForm
          communityId={42}
          blockOrder={2}
          initial={{ items: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }] }}
        />,
      ),
    );
    expect(screen.getByLabelText(/question 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect(screen.queryByLabelText(/question 2/i)).not.toBeInTheDocument();
  });

  it('pre-fills from the initial prop', () => {
    render(
      wrap(
        <FaqBlockForm
          communityId={42}
          blockOrder={2}
          initial={{ heading: 'FAQs', items: [{ question: 'Existing Q', answer: 'Existing A' }] }}
        />,
      ),
    );
    expect(screen.getByLabelText(/heading/i)).toHaveValue('FAQs');
    expect(screen.getByLabelText(/question 1/i)).toHaveValue('Existing Q');
    expect(screen.getByLabelText(/answer 1/i)).toHaveValue('Existing A');
  });

  it('submits PATCH with blockType faq and the correct content', async () => {
    render(wrap(<FaqBlockForm communityId={42} blockOrder={3} initial={null} />));
    await userEvent.type(screen.getByLabelText(/heading/i), 'Help');
    await userEvent.type(screen.getByLabelText(/question 1/i), 'How?');
    await userEvent.type(screen.getByLabelText(/answer 1/i), 'Like this.');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    const body = JSON.parse(init.body as string);
    expect(body.blockType).toBe('faq');
    expect(body.blockOrder).toBe(3);
    expect(body.content).toEqual({ heading: 'Help', items: [{ question: 'How?', answer: 'Like this.' }] });
  });

  it('surfaces a server error as an inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'PLAN_UPGRADE_REQUIRED', message: 'Upgrade required.' } }),
    });
    render(wrap(<FaqBlockForm communityId={42} blockOrder={2} initial={null} />));
    await userEvent.type(screen.getByLabelText(/question 1/i), 'Q');
    await userEvent.type(screen.getByLabelText(/answer 1/i), 'A');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Upgrade required.'));
  });
});
