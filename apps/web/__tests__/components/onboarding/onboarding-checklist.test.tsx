import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChecklist } from '../../../src/components/onboarding/onboarding-checklist';

const { mockPush, useOnboardingChecklistMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  useOnboardingChecklistMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@/hooks/use-onboarding-checklist', () => ({
  useOnboardingChecklist: useOnboardingChecklistMock,
}));
vi.mock('@/hooks/use-confetti', () => ({ useConfetti: vi.fn() }));

const CID = 42;

const ROUTE_EXPECTATIONS: Array<{
  itemKey: string;
  buttonLabel: string;
  expectedHref: string;
}> = [
  { itemKey: 'upload_first_document', buttonLabel: 'Upload',    expectedHref: `/communities/${CID}/documents` },
  { itemKey: 'upload_community_rules', buttonLabel: 'Upload',   expectedHref: `/communities/${CID}/documents` },
  { itemKey: 'add_units',              buttonLabel: 'Add',       expectedHref: `/dashboard/units?communityId=${CID}` },
  { itemKey: 'invite_first_member',    buttonLabel: 'Add',       expectedHref: `/dashboard/residents?communityId=${CID}` },
  { itemKey: 'review_compliance',      buttonLabel: 'View',      expectedHref: `/communities/${CID}/compliance` },
  { itemKey: 'post_announcement',      buttonLabel: 'Create',    expectedHref: `/announcements/new?communityId=${CID}` },
  { itemKey: 'customize_portal',       buttonLabel: 'Customize', expectedHref: `/pm/settings/branding?communityId=${CID}` },
  { itemKey: 'review_announcement',    buttonLabel: 'View',      expectedHref: `/announcements?communityId=${CID}` },
  { itemKey: 'check_compliance',       buttonLabel: 'View',      expectedHref: `/communities/${CID}/compliance` },
  { itemKey: 'access_document',        buttonLabel: 'Browse',    expectedHref: `/communities/${CID}/documents` },
  { itemKey: 'update_preferences',     buttonLabel: 'Update',    expectedHref: `/settings?communityId=${CID}` },
];

describe('OnboardingChecklist — action routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ROUTE_EXPECTATIONS)(
    'routes $itemKey ($buttonLabel) to $expectedHref',
    ({ itemKey, buttonLabel, expectedHref }) => {
      useOnboardingChecklistMock.mockReturnValue({
        isLoading: false,
        data: [{
          id: 1,
          itemKey,
          displayText: `Test ${itemKey}`,
          completedAt: null,
          createdAt: '2026-04-15T12:00:00.000Z',
        }],
      });

      render(<OnboardingChecklist communityId={CID} communityName="Sunset Condos" />);

      // Scope the lookup to the item's own <li> row so label collisions between
      // items ("Upload", "View") can't confuse the matcher if the test ever
      // renders multiple items.
      const row = screen.getByText(`Test ${itemKey}`).closest('li');
      if (!row) throw new Error(`No <li> rendered for ${itemKey}`);
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: buttonLabel }));

      expect(mockPush).toHaveBeenCalledWith(expectedHref);
    },
  );
});

describe('OnboardingChecklist — celebration CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the completion celebration to the community-scoped compliance page', () => {
    useOnboardingChecklistMock.mockReturnValue({
      isLoading: false,
      data: [{
        id: 99,
        itemKey: 'post_announcement',
        displayText: 'Done',
        completedAt: '2026-04-15T12:00:00.000Z',
        createdAt: '2026-04-15T12:00:00.000Z',
      }],
    });

    render(<OnboardingChecklist communityId={CID} communityName="Sunset Condos" />);
    fireEvent.click(screen.getByRole('button', { name: /view compliance/i }));

    expect(mockPush).toHaveBeenCalledWith(`/communities/${CID}/compliance`);
  });
});
