import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { CustomStylingForm } from '@/components/pm/site-editor/CustomStylingForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

const lastPatchBody = () => {
  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const call = calls.find(([url]) => url === '/api/v1/pm/site/blocks' || url === '/api/v1/pm/branding');
  return call ? JSON.parse(call[1].body as string) : null;
};

describe('<CustomStylingForm>', () => {
  it('locks the form with an upsell when hasSiteCustomCss is false', () => {
    render(wrap(<CustomStylingForm communityId={1} initial={null} hasSiteCustomCss={false} />));
    expect(screen.getByText(/professional/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(screen.getByLabelText(/override primary color/i)).toBeDisabled();
  });

  it('renders the four override toggles, enabled, when hasSiteCustomCss is true', () => {
    render(wrap(<CustomStylingForm communityId={1} initial={null} hasSiteCustomCss />));
    expect(screen.getByLabelText(/override primary color/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/override secondary color/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/override accent color/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/override body font/i)).toBeInTheDocument();
  });

  it('reveals a field input only when its override toggle is on', async () => {
    render(wrap(<CustomStylingForm communityId={1} initial={null} hasSiteCustomCss />));
    expect(screen.queryByLabelText(/^primary color value$/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/override primary color/i));
    expect(screen.getByLabelText(/^primary color value$/i)).toBeInTheDocument();
  });

  it('pre-fills enabled toggles and values from initial', () => {
    render(
      wrap(
        <CustomStylingForm
          communityId={1}
          initial={{ primaryColor: '#112233', bodyFont: 'Lato' }}
          hasSiteCustomCss
        />,
      ),
    );
    expect(screen.getByLabelText(/override primary color/i)).toBeChecked();
    expect(screen.getByLabelText(/^primary color value$/i)).toHaveValue('#112233');
    expect(screen.getByLabelText(/override body font/i)).toBeChecked();
    expect(screen.getByLabelText(/override secondary color/i)).not.toBeChecked();
  });

  it('saves only the enabled fields as customCssOverrides', async () => {
    render(wrap(<CustomStylingForm communityId={7} initial={null} hasSiteCustomCss />));
    await userEvent.click(screen.getByLabelText(/override primary color/i));
    fireEvent.change(screen.getByLabelText(/^primary color value$/i), { target: { value: '#abcdef' } });
    await userEvent.click(screen.getByLabelText(/override body font/i));
    await userEvent.selectOptions(screen.getByLabelText(/^body font value$/i), 'Merriweather');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = lastPatchBody();
    expect(body.communityId).toBe(7);
    expect(body.customCssOverrides).toEqual({ primaryColor: '#abcdef', bodyFont: 'Merriweather' });
  });

  it('saves null when every override is toggled off (clears overrides)', async () => {
    render(
      wrap(<CustomStylingForm communityId={1} initial={{ accentColor: '#778899' }} hasSiteCustomCss />),
    );
    await userEvent.click(screen.getByLabelText(/override accent color/i)); // turn the one enabled field off
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(lastPatchBody().customCssOverrides).toBeNull();
  });

  it('surfaces a server error as an inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'PLAN_UPGRADE_REQUIRED', message: 'Upgrade required.' } }),
    });
    render(wrap(<CustomStylingForm communityId={1} initial={null} hasSiteCustomCss />));
    await userEvent.click(screen.getByLabelText(/override primary color/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Upgrade required.'));
  });
});
