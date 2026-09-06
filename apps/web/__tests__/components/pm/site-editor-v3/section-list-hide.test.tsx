// @vitest-environment jsdom
/**
 * SectionList — the hide/show and duplicate affordances.
 *
 * The provider is mocked rather than rendered, matching the sibling suite in
 * `__tests__/components/pm/site-editor-v3/SectionList.test.tsx`: this is about
 * the panel's own contract — that a hidden section is *labelled* hidden, and
 * that the controls resolve to the right `toggleHidden` / `duplicate`
 * arguments. `toggleHidden`'s write shape is the provider's business.
 *
 * Sections are addressed by `blockId`, matching `move(blockId, direction)` and
 * `moveTo(blockId, toOrder)` — deliberately not a second addressing scheme.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';

const toggleHidden = vi.fn();
const duplicate = vi.fn();
/** Mutable so one test can put the provider into its refused-duplicate state. */
const state = vi.hoisted(() => ({
  duplicateError: null as string | null,
  isDuplicating: false,
}));

const sections = [
  { id: 1, blockType: 'text', blockOrder: 0, content: { body: 'Welcome' } },
  { id: 2, blockType: 'text', blockOrder: 1, content: { body: 'Rules', hidden: true } },
];

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    movableSections: sections,
    isSelected: () => false,
    select: vi.fn(),
    canMove: () => true,
    move: vi.fn(),
    moveTo: vi.fn(),
    isMoving: false,
    toggleHidden,
    duplicate,
    duplicateError: state.duplicateError,
    isDuplicating: state.isDuplicating,
  }),
}));

describe('SectionList hide affordance', () => {
  beforeEach(() => {
    toggleHidden.mockClear();
    duplicate.mockClear();
    state.duplicateError = null;
    state.isDuplicating = false;
  });

  it('labels a hidden section as hidden', () => {
    render(<SectionList />);
    expect(screen.getByText(/^hidden$/i)).toBeInTheDocument();
  });

  it('calls toggleHidden with the block id and the next state', async () => {
    render(<SectionList />);
    await userEvent.click(screen.getByRole('button', { name: /^hide .* section$/i }));
    expect(toggleHidden).toHaveBeenCalledWith(1, true);
  });

  it('offers to show a section that is already hidden', async () => {
    render(<SectionList />);
    await userEvent.click(screen.getByRole('button', { name: /^show .* section$/i }));
    expect(toggleHidden).toHaveBeenCalledWith(2, false);
  });

  it('calls duplicate with the block id', async () => {
    render(<SectionList />);
    const first = screen.getAllByRole('button', { name: /^duplicate .* section$/i })[0]!;
    await userEvent.click(first);
    expect(duplicate).toHaveBeenCalledWith(1);
  });

  it('shows a refused duplicate rather than leaving the click unexplained', () => {
    // A full page and a rejected write both leave the list looking exactly as
    // it did before the click. Without this the Duplicate button is the silent
    // no-op this panel already had once.
    state.duplicateError = 'This page is full — it already has the maximum of 98 sections.';
    render(<SectionList />);
    expect(screen.getByRole('alert')).toHaveTextContent(/page is full/i);
  });

  it('disables Duplicate while a duplicate is in flight, keeping its name', () => {
    // Two clicks during the write would compute the same free slot, and the
    // second would REPLACE the first copy — the hazard `AddPanel` disables its
    // own trigger for. Querying BY NAME is half the assertion: the disabled
    // state must not swallow the accessible name.
    state.isDuplicating = true;
    render(<SectionList />);
    const [first] = screen.getAllByRole('button', { name: /^duplicate .* section$/i });
    expect(first).toBeDisabled();
  });

  it('leaves Duplicate enabled when no duplicate is in flight', () => {
    render(<SectionList />);
    const [first] = screen.getAllByRole('button', { name: /^duplicate .* section$/i });
    expect(first).toBeEnabled();
  });

  it('renders no alert when nothing has been refused', () => {
    render(<SectionList />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
