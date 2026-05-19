import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeScreen } from '../../../src/components/onboarding/welcome-screen';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// WelcomeScreen now sources its checklist bootstrap from the
// use-onboarding-checklist TanStack mutation hook, so it must render inside
// a QueryClientProvider.
function Wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const baseProps = {
  firstName: 'Alex',
  role: 'owner',
  communityId: 42,
  community: {
    name: 'Sunset Condos', slug: 'sunset-condos',
    city: 'Miami', state: 'FL', communityType: 'condo_718' as const,
  },
  communityType: 'condo_718' as const,
  announcement: null,
  compliance: { score: 0, totalItems: 0, satisfiedItems: 0 },
  unit: null,
  recentActivity: '',
  logoUrl: null,
  primaryColor: null,
  checklistDisplayItems: [],
};

describe('WelcomeScreen — dashboard CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() => Promise.resolve(new Response(null))) as unknown as typeof fetch;
  });

  it('navigates to the community-scoped dashboard', async () => {
    render(
      <Wrapper>
        <WelcomeScreen {...baseProps} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /go to your dashboard/i }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/dashboard?communityId=42'),
    );
  });

  it('still navigates when the checklist bootstrap POST fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('network')),
    ) as unknown as typeof fetch;
    render(
      <Wrapper>
        <WelcomeScreen {...baseProps} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /go to your dashboard/i }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/dashboard?communityId=42'),
    );
  });
});
