/**
 * LazyCommunityProfileCard — the card's code arrives as a chunk of its own, and
 * until it does the page holds the card's place. That placeholder must announce
 * itself exactly as the card's own loading state does, so a screen reader hears
 * one "loading" and the swap between the two moves nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LazyCommunityProfileCard } from '@/components/settings/community-profile-card-lazy';

const PROFILE = {
  name: 'Sunset Condominium Association',
  shortName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  zipCode: null,
  unitCount: 40,
  officeHours: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
};

const fetchStub = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: PROFILE }),
}));

beforeEach(() => {
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LazyCommunityProfileCard', () => {
  it('holds the card’s place with an announced placeholder, then shows the card', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LazyCommunityProfileCard communityId={42} communityType="condo_718" />
      </QueryClientProvider>,
    );

    // Straight after the first render the card's code has not arrived, so it has
    // not asked for anything: this placeholder is the page's own.
    expect(screen.getByRole('status')).toHaveTextContent('Loading community profile');
    expect(fetchStub).not.toHaveBeenCalled();

    // Then the card takes over, with its props.
    expect(await screen.findByLabelText('Community name')).toHaveValue(PROFILE.name);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
