import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
const USER = 'user-a';
const COMPLIANCE_STEP = { label: 'View compliance dashboard', href: `/communities/${CID}/compliance` };

const ROUTE_EXPECTATIONS: Array<{
  itemKey: string;
  buttonLabel: string;
  expectedHref: string;
}> = [
  { itemKey: 'upload_first_document', buttonLabel: 'Upload',    expectedHref: `/communities/${CID}/documents` },
  { itemKey: 'upload_community_rules', buttonLabel: 'Upload',   expectedHref: `/communities/${CID}/documents` },
  { itemKey: 'add_units',              buttonLabel: 'Add',       expectedHref: `/dashboard/directory?communityId=${CID}&tab=units` },
  { itemKey: 'invite_first_member',    buttonLabel: 'Add',       expectedHref: `/dashboard/directory?communityId=${CID}&tab=residents` },
  { itemKey: 'review_compliance',      buttonLabel: 'View',      expectedHref: `/communities/${CID}/compliance` },
  { itemKey: 'post_announcement',      buttonLabel: 'Create',    expectedHref: `/announcements/new?communityId=${CID}` },
  { itemKey: 'customize_portal',       buttonLabel: 'Customize', expectedHref: `/pm/website?communityId=${CID}` },
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

      render(
        <OnboardingChecklist communityId={CID} communityName="Sunset Condos" userId={USER} nextStep={COMPLIANCE_STEP} />,
      );

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

function item(id: number, completedAt: string | null) {
  return {
    id,
    itemKey: 'post_announcement',
    displayText: `Item ${id}`,
    completedAt,
    createdAt: '2026-04-15T12:00:00.000Z',
  };
}
const DONE = '2026-04-15T12:00:00.000Z';
const ALL_COMPLETE = [item(1, DONE), item(2, DONE)];
const IN_PROGRESS = [item(1, DONE), item(2, null)];

function showItems(items: ReturnType<typeof item>[]) {
  useOnboardingChecklistMock.mockReturnValue({ isLoading: false, isError: false, data: items });
}

function renderChecklist(
  overrides: Partial<{ userId: string; nextStep: { label: string; href: string } | null }> = {},
) {
  return render(
    <OnboardingChecklist
      communityId={CID}
      communityName="Sunset Condos"
      userId={overrides.userId ?? USER}
      nextStep={overrides.nextStep === undefined ? COMPLIANCE_STEP : overrides.nextStep}
    />,
  );
}

describe('OnboardingChecklist — celebration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('routes to the next step it was given, and closes itself', () => {
    showItems(ALL_COMPLETE);
    renderChecklist({ nextStep: { label: 'Browse documents', href: `/communities/${CID}/documents` } });

    fireEvent.click(screen.getByRole('button', { name: 'Browse documents' }));

    expect(mockPush).toHaveBeenCalledWith(`/communities/${CID}/documents`);
    expect(screen.queryByText('Your community is set up')).toBeNull();
  });

  it('offers no link when no next step is permitted', () => {
    showItems(ALL_COMPLETE);
    renderChecklist({ nextStep: null });

    expect(screen.getByText('Your community is set up')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /compliance|documents/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('closes when its close button is pressed, and stays closed on the next visit', () => {
    showItems(ALL_COMPLETE);
    const { unmount } = renderChecklist();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss setup celebration' }));
    expect(screen.queryByText('Your community is set up')).toBeNull();

    unmount();
    renderChecklist();
    expect(screen.queryByText('Your community is set up')).toBeNull();
  });

  it('still shows after the unfinished checklist was dismissed', () => {
    showItems(IN_PROGRESS);
    const { unmount } = renderChecklist();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss checklist' }));
    expect(screen.queryByText('Finish setting up your community')).toBeNull();
    unmount();

    showItems(ALL_COMPLETE);
    renderChecklist();
    expect(screen.getByText('Your community is set up')).toBeTruthy();
  });
});

describe('OnboardingChecklist — dismissal is per person and community', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("one person's dismissal does not hide another person's checklist", () => {
    showItems(IN_PROGRESS);
    const { unmount } = renderChecklist({ userId: 'user-a' });
    fireEvent.click(screen.getByRole('button', { name: /handle this later/i }));
    unmount();

    renderChecklist({ userId: 'user-b' });
    expect(screen.getByText('Finish setting up your community')).toBeTruthy();
  });

  it('stays dismissed for the person who dismissed it', () => {
    showItems(IN_PROGRESS);
    const { unmount } = renderChecklist();
    fireEvent.click(screen.getByRole('button', { name: /handle this later/i }));
    unmount();

    renderChecklist();
    expect(screen.queryByText('Finish setting up your community')).toBeNull();
  });

  it('moves a legacy community-only dismissal to the person who reads it, once', () => {
    localStorage.setItem(`onboarding-checklist-dismissed-${CID}`, 'true');
    showItems(IN_PROGRESS);
    const { unmount } = renderChecklist({ userId: 'user-a' });
    expect(screen.queryByText('Finish setting up your community')).toBeNull();
    expect(localStorage.getItem(`onboarding-checklist-dismissed-${CID}`)).toBeNull();
    unmount();

    renderChecklist({ userId: 'user-b' });
    expect(screen.getByText('Finish setting up your community')).toBeTruthy();
  });

  it('renders normally when browser storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      showItems(IN_PROGRESS);
      renderChecklist();
      expect(screen.getByText('Finish setting up your community')).toBeTruthy();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /handle this later/i }));
      });
      expect(screen.queryByText('Finish setting up your community')).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });
});
