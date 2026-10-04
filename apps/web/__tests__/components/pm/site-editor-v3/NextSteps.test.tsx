/**
 * Website builder v4, Phase 3 — the Guided panel's Next steps.
 *
 * `buildNextSteps` (next-steps.test.ts) decides the items; this protects how
 * they are drawn and what their buttons do: the two actions resolved here
 * (show a hidden section, select the welcome section) and the hand-off of the
 * rest to the editor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { required, editor, checklist } = vi.hoisted(() => ({
  required: {
    level: 'required' as 'required' | 'recommended' | 'none',
    statuses: [] as Array<{
      blockType: string;
      title: string;
      state: 'visible' | 'hidden' | 'missing';
      hiddenAt?: { pageId: string; slot: number };
    }>,
    showSection: vi.fn(() => true),
  },
  editor: {
    blocks: [] as Array<{ id: number; blockType: string; blockOrder: number; pageId: number }>,
    select: vi.fn(),
  },
  checklist: { data: undefined as unknown, enabled: [] as boolean[] },
}));

vi.mock('@/components/pm/site-editor-v3/required-sections-context', () => ({
  useRequiredSections: () => ({
    ...required,
    lawFor: (t: string) => `Florida law asks for ${t}.`,
  }),
}));
vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => editor,
}));
vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: (_id: number, options: { enabled: boolean }) => {
    checklist.enabled.push(options.enabled);
    return { data: checklist.data };
  },
}));

import { NextSteps } from '@/components/pm/site-editor-v3/guidance/NextSteps';

const HOME = 1;
const hero = {
  id: 10,
  blockType: 'hero',
  blockOrder: 0,
  pageId: HOME,
  content: {},
  isDraft: false,
  publishedAt: null,
};

const onMark = vi.fn();
const onAction = vi.fn();
const onGoToSlot = vi.fn();
const onWarnResidents = vi.fn();

function renderSteps(overrides: Partial<React.ComponentProps<typeof NextSteps>> = {}) {
  return render(
    <NextSteps
      communityId={42}
      communityType="condo_718"
      pageId={HOME}
      homePageId={HOME}
      homeHero={hero}
      everPublished={false}
      pendingChanges={3}
      preferences={{ marked: [], visited: [] }}
      onMark={onMark}
      onAction={onAction}
      onGoToSlot={onGoToSlot}
      onWarnResidents={onWarnResidents}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  required.level = 'required';
  required.statuses = [
    { blockType: 'documents', title: 'Documents section', state: 'visible' },
    {
      blockType: 'meetings',
      title: 'Meetings section',
      state: 'hidden',
      hiddenAt: { pageId: '2', slot: 4 },
    },
  ];
  required.showSection.mockReturnValue(true);
  editor.blocks = [hero];
  checklist.data = undefined;
  checklist.enabled = [];
});

describe('NextSteps — layout', () => {
  it('shows progress and the Florida items first, with the law line on an open one', () => {
    renderSteps();
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 8 done',
    );
    const groups = screen.getAllByRole('region');
    expect(groups[0]).toHaveAccessibleName('Required by Florida law');
    expect(
      within(screen.getByTestId('next-step-section-meetings')).getByText(
        'Florida law asks for meetings.',
      ),
    ).toBeInTheDocument();
  });

  it('expands only the first open setup step', () => {
    renderSteps({ preferences: { marked: ['welcome'], visited: [] } });
    expect(
      within(screen.getByTestId('next-step-photo')).getByRole('button', { name: 'Show me' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('next-step-design')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('asks apartments for no records checklist', () => {
    required.level = 'none';
    renderSteps({ communityType: 'apartment' });
    expect(checklist.enabled).toEqual([false]);
    expect(screen.queryByRole('region', { name: /Florida law/ })).not.toBeInTheDocument();
  });
});

describe('NextSteps — actions', () => {
  it('shows a hidden required section in place', async () => {
    renderSteps();
    await userEvent.click(screen.getByRole('button', { name: 'Show section' }));
    expect(required.showSection).toHaveBeenCalledWith({ pageId: '2', slot: 4 });
    expect(onGoToSlot).not.toHaveBeenCalled();
  });

  it('takes the PM to a hidden section it cannot show in place', async () => {
    required.showSection.mockReturnValue(false);
    renderSteps();
    await userEvent.click(screen.getByRole('button', { name: 'Show section' }));
    expect(onGoToSlot).toHaveBeenCalledWith({ pageId: '2', slot: 4 });
  });

  it('selects the welcome section in place on the home page', async () => {
    renderSteps();
    await userEvent.click(
      within(screen.getByTestId('next-step-welcome')).getByRole('button', { name: 'Show me' }),
    );
    expect(editor.select).toHaveBeenCalledWith(10);
    expect(onGoToSlot).not.toHaveBeenCalled();
  });

  it('goes to the home page for the welcome section from another page', async () => {
    editor.blocks = [];
    renderSteps({ pageId: 2 });
    await userEvent.click(
      within(screen.getByTestId('next-step-welcome')).getByRole('button', { name: 'Show me' }),
    );
    expect(onGoToSlot).toHaveBeenCalledWith({ pageId: String(HOME), slot: 0 });
  });

  it('hands every other action to the editor', async () => {
    required.statuses = [{ blockType: 'meetings', title: 'Meetings section', state: 'missing' }];
    renderSteps();
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(onAction).toHaveBeenCalledWith({ kind: 'add-section', blockType: 'meetings' });
  });

  it('ticks a step by hand', async () => {
    renderSteps();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(onMark).toHaveBeenCalledWith('welcome');
  });

  it('offers the urgent notice', async () => {
    renderSteps();
    await userEvent.click(screen.getByRole('button', { name: /need to warn residents now/i }));
    expect(onWarnResidents).toHaveBeenCalledTimes(1);
  });

  it('counts a welcome section with a photo as done', () => {
    renderSteps({ homeHero: { ...hero, content: { photos: [{ path: 'a.jpg', alt: 'Pool' }] } } });
    expect(within(screen.getByTestId('next-step-photo')).getByText('(done)')).toBeInTheDocument();
  });
});
