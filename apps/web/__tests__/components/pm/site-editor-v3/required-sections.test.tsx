// @vitest-environment jsdom
/**
 * Florida-required sections in the editor (v4 builder, Phase 2): the locks on
 * Duplicate and Remove, the confirmation before hiding the last visible copy,
 * and the top bar's requirements pill.
 *
 * The REAL `RequiredSectionsProvider` is rendered — it is the unit under test —
 * fed with whole-site snapshots the way `EditorRoot` feeds it from
 * `useSiteDiff().validated`. The page-scoped editor context is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RequiredSectionPage } from '@propertypro/shared';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { FloatControls } from '@/components/pm/site-editor-v3/canvas/FloatControls';
import { RequirementsPill } from '@/components/pm/site-editor-v3/RequirementsPill';
import {
  RequiredSectionsProvider,
  useRequiredSections,
  type RequiredSectionsValue,
} from '@/components/pm/site-editor-v3/required-sections-context';

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

const upsertMutate = vi.hoisted(() => vi.fn());
const unitCountApi = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-community-unit-count', () => ({
  useUpdateCommunityUnitCount: () => unitCountApi,
}));
vi.mock('@/hooks/use-content-blocks', () => ({
  usePublishedBlocks: () => ({ data: [] }),
  useUpsertContentBlock: () => ({ mutate: upsertMutate, isPending: false }),
}));

// The pill reads the compliance checklist; `undefined` data is "still loading".
const checklist = vi.hoisted(() => ({
  data: undefined as ChecklistItemData[] | undefined,
  isError: false,
}));
vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: (_communityId: number, options?: { enabled?: boolean }) =>
    options?.enabled === false ? { data: undefined, isError: false } : checklist,
}));

function recordItem(id: number, posted: boolean): ChecklistItemData {
  return {
    id,
    templateKey: `k${id}`,
    title: `Record ${id}`,
    category: 'governing_documents',
    status: posted ? 'satisfied' : 'unsatisfied',
    documentId: posted ? id : null,
    documentState: posted ? 'posted' : null,
  };
}

/** `posted` of `total` records on the website; the rest nothing posted. */
function records(posted: number, total: number): ChecklistItemData[] {
  return Array.from({ length: total }, (_, i) => recordItem(i + 1, i < posted));
}

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

/**
 * Defaults to a 60-unit condo (covered by the statute) whose whole site is the
 * current page's `editor.blocks`, viewed by an admin.
 */
function renderWith(
  ui: React.ReactNode,
  {
    communityType = 'condo_718',
    unitCount = 60,
    canEditUnitCount = true,
    pages,
  }: {
    communityType?: string;
    unitCount?: number | null;
    canEditUnitCount?: boolean;
    pages?: RequiredSectionPage[];
  } = {},
) {
  return render(
    <RequiredSectionsProvider
      communityId={7}
      communityType={communityType}
      unitCount={unitCount}
      canEditUnitCount={canEditUnitCount}
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
  upsertMutate.mockClear();
  unitCountApi.mutateAsync.mockReset();
  editor.blocks = [block(2, 'text'), block(3, 'meetings'), block(4, 'documents')];
  checklist.data = records(12, 12);
  checklist.isError = false;
});

// These ran against the Sections tool's list until it went with the tool rail
// (combined plan Task 28); the section toolbar on the page shares its hide
// confirmation (`useHideToggle`) and duplicate lock, so they run there now.
describe('FloatControls — hiding and copying required sections', () => {
  const meetings = () => <FloatControls block={editor.blocks[1]!} communityId={7} />;

  it('locks Duplicate on a required section, not on an optional one', () => {
    renderWith(
      <>
        {meetings()}
        <FloatControls block={editor.blocks[0]!} communityId={7} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Duplicate Meetings section' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicate Text section' })).toBeEnabled();
  });

  it('asks before hiding the last visible copy, and hides only on "Hide anyway"', async () => {
    const user = userEvent.setup();
    renderWith(meetings());

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
    renderWith(meetings());

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    await user.click(await screen.findByRole('button', { name: 'Keep it visible' }));
    expect(editor.toggleHidden).not.toHaveBeenCalled();
  });

  it('hides without asking when another visible copy exists on another page', async () => {
    const user = userEvent.setup();
    renderWith(meetings(), {
      pages: sitePages({ [HOME]: editor.blocks, 11: [block(5, 'meetings', { pageId: 11 })] }),
    });

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    expect(editor.toggleHidden).toHaveBeenCalledWith(3, true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('never asks about a section on an apartment site', async () => {
    const user = userEvent.setup();
    renderWith(meetings(), { communityType: 'apartment' });

    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    expect(editor.toggleHidden).toHaveBeenCalledTimes(1);
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
      <RequiredSectionsProvider
        communityId={7}
        communityType="condo_718"
        unitCount={60}
        canEditUnitCount
        pages={undefined}
      >
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

  it('the pill reads "Records: 9 of 12 posted" for the fixture and is not "all set"', () => {
    checklist.data = records(9, 12);
    renderWith(pill());
    const trigger = screen.getByTestId('requirements-pill');
    expect(trigger).toHaveAccessibleName('Records: 9 of 12 posted');
    expect(trigger).toHaveTextContent('Records: 9 of 12 posted');
    expect(trigger).not.toHaveTextContent(/all set/i);
    // Not the green "set" colours either.
    expect(trigger).toHaveClass('text-status-danger');
  });

  it('the red records pill opens on how many records are missing, linked to the website home', async () => {
    const user = userEvent.setup();
    checklist.data = records(9, 12);
    renderWith(pill());

    await user.click(screen.getByRole('button', { name: 'Records: 9 of 12 posted' }));

    expect(await screen.findByText('3 records are still missing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See which ones' })).toHaveAttribute(
      'href',
      '/pm/website?communityId=7#records',
    );
  });

  it('the green pill lists no missing records', async () => {
    const user = userEvent.setup();
    renderWith(pill());

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));

    await screen.findByText('Required by Florida law');
    expect(screen.queryByText(/still missing/)).not.toBeInTheDocument();
  });

  it('keeps naming a hidden section first, whatever the records say', () => {
    checklist.data = records(9, 12);
    editor.blocks = [block(3, 'meetings', { content: { hidden: true } }), block(4, 'documents')];
    renderWith(pill());
    expect(screen.getByTestId('requirements-pill')).toHaveAccessibleName('Required item missing');
  });

  it('says nothing while the records are loading or could not be read', () => {
    checklist.data = undefined;
    const { container } = renderWith(pill());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a hidden section on this page in one click, writing to this page', async () => {
    const user = userEvent.setup();
    editor.blocks = [block(3, 'meetings', { content: { hidden: true, heading: 'Board' } }), block(4, 'documents')];
    renderWith(pill());

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    await user.click(await screen.findByRole('button', { name: 'Show it' }));
    expect(upsertMutate).toHaveBeenCalledWith({
      blockType: 'meetings',
      blockOrder: 3,
      content: { heading: 'Board' },
      pageId: HOME,
    });
    expect(onGoToSection).not.toHaveBeenCalled();
  });

  it('shows a hidden section on ANOTHER page in one click, writing to that page', async () => {
    // The write must carry page 11's id: the hooks default to the SELECTED
    // page, and a page-less write would land on whatever is open (D-WRITE).
    const user = userEvent.setup();
    renderWith(pill(), {
      pages: sitePages({
        [HOME]: [block(4, 'documents')],
        11: [block(6, 'meetings', { pageId: 11, content: { hidden: true } })],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    await user.click(await screen.findByRole('button', { name: 'Show it' }));
    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ blockType: 'meetings', blockOrder: 6, pageId: 11, content: {} }),
    );
    expect(onGoToSection).not.toHaveBeenCalled();
  });

  it('falls back to taking the PM there when the section is on no page it can write to', async () => {
    const user = userEvent.setup();
    renderWith(pill(), {
      pages: [
        ...sitePages({ [HOME]: [block(4, 'documents')] }),
        // `SITE_CHANGE_GROUP` — blocks with no page; no write can address them.
        { pageId: 'site', snapshot: { hero: null, sections: [{ slot: 6, blockType: 'meetings', content: { hidden: true } }] } },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Required item missing' }));
    await user.click(await screen.findByRole('button', { name: 'Show it' }));
    expect(upsertMutate).not.toHaveBeenCalled();
    expect(onGoToSection).toHaveBeenCalledWith({ pageId: 'site', slot: 6 });
  });

  it('opens Add a part for a missing section', async () => {
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
      <RequiredSectionsProvider
        communityId={7}
        communityType="condo_718"
        unitCount={60}
        canEditUnitCount
        pages={undefined}
      >
        {pill()}
      </RequiredSectionsProvider>,
    );
    expect(loading.container).toBeEmptyDOMElement();
  });
});

describe('below the size threshold — recommended, never locked', () => {
  const small = { unitCount: 12 };

  it('leaves Duplicate and Hide alone', async () => {
    const user = userEvent.setup();
    renderWith(<FloatControls block={editor.blocks[1]!} communityId={7} />, small);

    expect(screen.getByRole('button', { name: 'Duplicate Meetings section' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Hide Meetings section' }));
    expect(editor.toggleHidden).toHaveBeenCalledWith(3, true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not lock Remove on the only copy', () => {
    renderWith(<FloatControls block={editor.blocks[1]!} communityId={7} />, small);
    expect(screen.getByRole('button', { name: 'Remove Meetings section' })).toBeEnabled();
  });

  it('shows a neutral pill that says the rules do not apply, and why', async () => {
    const user = userEvent.setup();
    editor.blocks = [block(4, 'documents')]; // Meetings missing — not a problem here
    renderWith(<RequirementsPill onGoToSection={vi.fn()} onAddSection={vi.fn()} />, small);

    await user.click(screen.getByRole('button', { name: 'Florida website rules: not required' }));
    expect(await screen.findByText(/25 or more units\. Yours has 12/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add it' })).not.toBeInTheDocument();
  });
});

describe('the unit count', () => {
  const pill = () => <RequirementsPill onGoToSection={vi.fn()} onAddSection={vi.fn()} />;

  it('when unknown, treats the sections as required and asks for it', async () => {
    const user = userEvent.setup();
    renderWith(<FloatControls block={editor.blocks[1]!} communityId={7} />, { unitCount: null });
    expect(screen.getByRole('button', { name: 'Remove Meetings section' })).toBeDisabled();

    renderWith(pill(), { unitCount: null });
    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    expect(await screen.findByText(/Until you tell us how many yours has/)).toBeInTheDocument();
    expect(screen.getByLabelText('How many units does your association have?')).toBeInTheDocument();
  });

  it('saving a small count unlocks the required sections without a reload', async () => {
    const user = userEvent.setup();
    unitCountApi.mutateAsync.mockResolvedValue({ unitCount: 12 });
    renderWith(
      <>
        {pill()}
        <FloatControls block={editor.blocks[1]!} communityId={7} />
      </>,
      { unitCount: null },
    );
    expect(screen.getByRole('button', { name: 'Remove Meetings section' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    await user.type(await screen.findByLabelText('How many units does your association have?'), '12');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(unitCountApi.mutateAsync).toHaveBeenCalledWith(12);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Meetings section' })).toBeEnabled(),
    );
  });

  it('refuses a non-number before calling the server', async () => {
    const user = userEvent.setup();
    renderWith(pill(), { unitCount: null });

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    await user.type(await screen.findByLabelText('How many units does your association have?'), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/whole number of units, from 1/);
    expect(unitCountApi.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the server refusal', async () => {
    const user = userEvent.setup();
    unitCountApi.mutateAsync.mockRejectedValue(new Error('Only admins can change the number of units'));
    renderWith(pill(), { unitCount: null });

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    await user.type(await screen.findByLabelText('How many units does your association have?'), '30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only admins can change the number of units');
  });

  it('says "parcels" for an HOA, and offers Change once known', async () => {
    const user = userEvent.setup();
    renderWith(pill(), { communityType: 'hoa_720', unitCount: 140 });

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    expect(await screen.findByText('Based on 140 parcels.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('How many parcels does your association have?')).toHaveValue(140);
  });

  it('is read-only for a non-admin, saying who can change it', async () => {
    const user = userEvent.setup();
    renderWith(pill(), { unitCount: null, canEditUnitCount: false });

    await user.click(screen.getByRole('button', { name: 'Required items: all set' }));
    expect(await screen.findByText(/Ask a community admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('RequiredSectionsProvider', () => {
  it('keeps the same value across re-renders with unchanged inputs', () => {
    // The mutation hooks return a NEW result object every render (as TanStack's
    // do) with a stable `mutate`. Depending on the object recomputed the value
    // on every render and re-rendered every row, toolbar and the pill with it.
    const seen: RequiredSectionsValue[] = [];
    function Probe() {
      seen.push(useRequiredSections());
      return null;
    }
    const pages = sitePages({ [HOME]: editor.blocks });
    const tree = () => (
      <RequiredSectionsProvider
        communityId={7}
        communityType="condo_718"
        unitCount={60}
        canEditUnitCount
        pages={pages}
      >
        <Probe />
      </RequiredSectionsProvider>
    );
    const { rerender } = render(tree());
    rerender(tree());

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });
});
