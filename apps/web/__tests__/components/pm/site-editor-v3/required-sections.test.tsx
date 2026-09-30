// @vitest-environment jsdom
/**
 * Florida-required sections in the editor (v4 builder, Phase 2): the locks on
 * Duplicate and Remove, the confirmation before hiding the last visible copy,
 * and the top bar's requirements pill.
 *
 * The REAL `RequiredSectionsProvider` is rendered — it is the unit under test —
 * fed with whole-site snapshots the way `EditorRoot` feeds it from
 * `useSiteDiff().validated`. The page-scoped editor context is mocked, as in
 * `section-list-hide.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RequiredSectionPage } from '@propertypro/shared';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';
import { FloatControls } from '@/components/pm/site-editor-v3/canvas/FloatControls';
import { RequirementsPill } from '@/components/pm/site-editor-v3/RequirementsPill';
import { RequiredSectionsProvider } from '@/components/pm/site-editor-v3/required-sections-context';

const HOME = 10;

const editor = vi.hoisted(() => ({
  toggleHidden: vi.fn(),
  duplicate: vi.fn(),
  blocks: [] as SiteBlockSummary[],
}));

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    blocks: editor.blocks,
    movableSections: editor.blocks,
    isSelected: () => false,
    select: vi.fn(),
    canMove: () => true,
    move: vi.fn(),
    moveTo: vi.fn(),
    isMoving: false,
    toggleHidden: editor.toggleHidden,
    duplicate: editor.duplicate,
    duplicateError: null,
    isDuplicating: false,
  }),
}));

vi.mock('@/hooks/use-content-blocks', () => ({
  usePublishedBlocks: () => ({ data: [] }),
}));

const requestRemove = vi.fn();
vi.mock('@/components/pm/site-editor-v3/use-undoable-remove', () => ({
  useUndoableRemove: () => ({
    isConfirmOpen: false,
    setConfirmOpen: vi.fn(),
    requestRemove,
    confirmRemove: vi.fn(),
    isPending: false,
  }),
}));

function block(id: number, blockType: string, overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id,
    pageId: HOME,
    blockType,
    blockOrder: id,
    content: {},
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Whole-site snapshots, as `useSiteDiff().validated` would hand them over. */
function sitePages(byPage: Record<number, SiteBlockSummary[]>): RequiredSectionPage[] {
  return Object.entries(byPage).map(([pageId, blocks]) => ({
    pageId,
    snapshot: {
      hero: null,
      sections: blocks.map((b) => ({ slot: b.blockOrder, blockType: b.blockType, content: b.content })),
    },
  }));
}

/** Defaults to a condo whose whole site is the current page's `editor.blocks`. */
function renderWith(
  ui: React.ReactNode,
  { communityType = 'condo_718', pages }: { communityType?: string; pages?: RequiredSectionPage[] } = {},
) {
  return render(
    <RequiredSectionsProvider
      communityType={communityType}
      pages={pages ?? sitePages({ [HOME]: editor.blocks })}
    >
      {ui}
    </RequiredSectionsProvider>,
  );
}

beforeEach(() => {
  editor.toggleHidden.mockClear();
  editor.duplicate.mockClear();
  requestRemove.mockClear();
  editor.blocks = [block(2, 'text'), block(3, 'meetings'), block(4, 'documents')];
});

describe('SectionList — required sections', () => {
  it('badges required sections and locks their Duplicate', () => {
    renderWith(<SectionList />);

    expect(screen.getAllByText('Required')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Duplicate Meetings section' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicate Text section' })).toBeEnabled();
  });

  it('asks before hiding the last visible copy, and hides only on "Hide anyway"', async () => {
    const user = userEvent.setup();
    renderWith(<SectionList />);

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/§718\.111\(12\)\(g\)/);
    expect(dialog).toHaveTextContent(/meeting notices/);
    expect(dialog).not.toHaveTextContent(/\$|per day|fine/i);
    expect(editor.toggleHidden).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hide anyway' }));
    expect(editor.toggleHidden).toHaveBeenCalledWith(3, true);
  });

  it('keeps it visible on "Keep it visible"', async () => {
    const user = userEvent.setup();
    renderWith(<SectionList />);

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    await user.click(await screen.findByRole('button', { name: 'Keep it visible' }));
    expect(editor.toggleHidden).not.toHaveBeenCalled();
  });

  it('hides without asking when another visible copy exists on another page', async () => {
    const user = userEvent.setup();
    renderWith(<SectionList />, {
      pages: sitePages({ [HOME]: editor.blocks, 11: [block(5, 'meetings', { pageId: 11 })] }),
    });

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    expect(editor.toggleHidden).toHaveBeenCalledWith(3, true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('never asks about an optional section, or on an apartment site', async () => {
    const user = userEvent.setup();
    renderWith(<SectionList />, { communityType: 'apartment' });

    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    await user.click(screen.getByRole('button', { name: 'Hide Text section' }));
    expect(editor.toggleHidden).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Duplicate Meetings section' })).toBeEnabled();
  });
});

describe('FloatControls — required sections', () => {
  it('locks Remove on the site’s only copy', () => {
    renderWith(<FloatControls block={editor.blocks[1]!} communityId={7} />);
    const remove = screen.getByRole('button', { name: 'Remove Meetings section' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', expect.stringMatching(/Required by Florida law/));
    expect(screen.getByRole('button', { name: 'Duplicate Meetings section' })).toBeDisabled();
  });

  it('allows removing one of two copies — hidden copies count', async () => {
    const hiddenCopy = block(5, 'meetings', { pageId: 11, content: { hidden: true } });
    renderWith(<FloatControls block={editor.blocks[1]!} communityId={7} />, {
      pages: sitePages({ [HOME]: editor.blocks, 11: [hiddenCopy] }),
    });
    const remove = screen.getByRole('button', { name: 'Remove Meetings section' });
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(requestRemove).toHaveBeenCalled();
  });

  it('stays locked while the whole-site snapshot is still loading', () => {
    render(
      <RequiredSectionsProvider communityType="condo_718" pages={undefined}>
        <FloatControls block={editor.blocks[1]!} communityId={7} />
      </RequiredSectionsProvider>,
    );
    expect(screen.getByRole('button', { name: 'Remove Meetings section' })).toBeDisabled();
  });

  it('leaves optional sections alone', () => {
    renderWith(<FloatControls block={editor.blocks[0]!} communityId={7} />);
    expect(screen.getByRole('button', { name: 'Remove Text section' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Duplicate Text section' })).toBeEnabled();
  });
});

describe('RequirementsPill', () => {
  const onGoToSection = vi.fn();
  const onAddSection = vi.fn();
  const pill = () => <RequirementsPill onGoToSection={onGoToSection} onAddSection={onAddSection} />;

  beforeEach(() => {
    onGoToSection.mockClear();
    onAddSection.mockClear();
  });

  it('reads "all set" when both sections are visible', () => {
    renderWith(pill());
    expect(screen.getByTestId('requirements-pill')).toHaveAccessibleName('Required items: all set');
  });

  it('shows a hidden section on this page in one click', async () => {
    const user = userEvent.setup();
    editor.blocks = [block(3, 'meetings', { content: { hidden: true } }), block(4, 'documents')];
    renderWith(pill());

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    await user.click(await screen.findByRole('button', { name: 'Show it' }));
    expect(editor.toggleHidden).toHaveBeenCalledWith(3, false);
    expect(onGoToSection).not.toHaveBeenCalled();
  });

  it('takes the PM to a hidden section on another page', async () => {
    const user = userEvent.setup();
    renderWith(pill(), {
      pages: sitePages({
        [HOME]: [block(4, 'documents')],
        11: [block(6, 'meetings', { pageId: 11, content: { hidden: true } })],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    await user.click(await screen.findByRole('button', { name: 'Go to it' }));
    expect(onGoToSection).toHaveBeenCalledWith({ pageId: '11', slot: 6 });
    expect(editor.toggleHidden).not.toHaveBeenCalled();
  });

  it('opens the Add tool for a missing section', async () => {
    const user = userEvent.setup();
    editor.blocks = [block(4, 'documents')];
    renderWith(pill());

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    expect(await screen.findByText('Meetings section is missing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add it' }));
    expect(onAddSection).toHaveBeenCalled();
  });

  it('renders nothing for an apartment, or while the site is loading', () => {
    const { container } = renderWith(pill(), { communityType: 'apartment' });
    expect(container).toBeEmptyDOMElement();

    const loading = render(
      <RequiredSectionsProvider communityType="condo_718" pages={undefined}>
        {pill()}
      </RequiredSectionsProvider>,
    );
    expect(loading.container).toBeEmptyDOMElement();
  });
});
