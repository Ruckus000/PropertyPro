import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChecklist } from '../../../src/components/onboarding/onboarding-checklist';

const { mockPush, useOnboardingChecklistMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  useOnboardingChecklistMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/hooks/use-onboarding-checklist', () => ({
  useOnboardingChecklist: useOnboardingChecklistMock,
}));

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingChecklistMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: 1,
          itemKey: 'post_announcement',
          displayText: 'Post your first announcement',
          completedAt: null,
          createdAt: '2026-04-15T12:00:00.000Z',
        },
      ],
    });
  });

  it('routes the post announcement action to the routed create page', () => {
    render(
      <OnboardingChecklist
        communityId={42}
        communityName="Sunset Condos"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockPush).toHaveBeenCalledWith('/announcements/new?communityId=42');
  });
});
