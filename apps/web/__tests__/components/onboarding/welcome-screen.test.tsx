import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeScreen } from '../../../src/components/onboarding/welcome-screen';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

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
    render(<WelcomeScreen {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /go to your dashboard/i }));
    // fetch resolves on the same tick; navigation happens next microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(mockPush).toHaveBeenCalledWith('/dashboard?communityId=42');
  });
});
