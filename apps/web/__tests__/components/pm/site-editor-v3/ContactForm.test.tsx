/**
 * Contact inspector form — two booleans over an all-defaulted schema.
 *
 * Small, but with one non-obvious invariant worth pinning: `toCanonical` must
 * always emit BOTH keys. The route stores `parse.data`, so the refetch always
 * returns the fully-defaulted object; a payload that omitted a key at its
 * default would never match its own echo in `useBlockForm`, and every toggle
 * round-trip would look like a foreign change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { contactBlockSchema } from '@propertypro/shared';
import { ContactForm } from '@/components/pm/site-editor-v3/inspector/forms/ContactForm';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

import { setupTimers, settleAutosave } from './autosave-harness';

function renderForm(content: unknown = { showBoard: true, showManagement: true }) {
  return render(
    <ContactForm communityId={1} blockType="contact" blockOrder={3} content={content} />,
  );
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ContactForm', () => {
  it('reflects the stored configuration', () => {
    renderForm({ showBoard: false, showManagement: true });
    expect(screen.getByLabelText('Show board members')).not.toBeChecked();
    expect(screen.getByLabelText('Show management contact')).toBeChecked();
  });

  it('defaults both to visible for a block whose content is unreadable', () => {
    // A contact block that cannot be parsed should show the community's
    // details, not hide them.
    renderForm('not an object');
    expect(screen.getByLabelText('Show board members')).toBeChecked();
    expect(screen.getByLabelText('Show management contact')).toBeChecked();
  });

  it('always writes both keys, even at their defaults', async () => {
    // The echo invariant. Omitting a defaulted key would leave useBlockForm
    // comparing what it sent against the fully-defaulted object the refetch
    // returns, and every toggle would trigger a spurious adopt cycle.
    const user = setupTimers();
    renderForm({ showBoard: true, showManagement: true });

    await user.click(screen.getByLabelText('Show board members'));
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'contact',
      blockOrder: 3,
      content: { showBoard: false, showManagement: true },
    });

    await user.click(screen.getByLabelText('Show board members'));
    await settleAutosave();

    const written = upsertMock.mock.calls.at(-1)![0].content;
    expect(written).toEqual({ showBoard: true, showManagement: true });
    expect(contactBlockSchema.safeParse(written).success).toBe(true);
  });

  it('warns when hiding both leaves the section empty', async () => {
    const user = setupTimers();
    renderForm({ showBoard: true, showManagement: true });

    expect(screen.queryByText(/shows nothing/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Show board members'));
    await user.click(screen.getByLabelText('Show management contact'));

    expect(screen.getByText(/shows nothing/i)).toBeInTheDocument();
  });

  it('still saves with both hidden — it is valid, just empty', async () => {
    // Every field has a default, so there is no incomplete state. Hiding both
    // is a choice, not an error, and the schema accepts it.
    const user = setupTimers();
    renderForm({ showBoard: true, showManagement: true });

    await user.click(screen.getByLabelText('Show board members'));
    await user.click(screen.getByLabelText('Show management contact'));
    await settleAutosave();

    expect(upsertMock.mock.calls.at(-1)![0].content).toEqual({
      showBoard: false,
      showManagement: false,
    });
  });
});
