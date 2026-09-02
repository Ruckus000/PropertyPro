/**
 * FAQ inspector form.
 *
 * `TextForm.test.tsx` covers the shared autosave machinery, so this file sticks
 * to what this form adds: the `firstProblem` rule that decides when a draft can
 * be written, and the round-trip through `faqBlockSchema`.
 *
 * The rule is worth its own attention because it is the difference between
 * "silently discards what the PM typed" and "refuses, and says which row".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { faqBlockSchema } from '@propertypro/shared';
import { FaqForm, firstProblem } from '@/components/pm/site-editor-v3/inspector/forms/FaqForm';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

import { setupTimers, settleAutosave } from './autosave-harness';

function renderForm(content: unknown) {
  return render(
    <FaqForm communityId={1} blockType="faq" blockOrder={4} content={content} />,
  );
}

const ONE_ITEM = { items: [{ question: 'Is there parking?', answer: 'Yes, one space.' }] };

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('firstProblem', () => {
  it('accepts a draft with at least one complete pair', () => {
    expect(
      firstProblem({ heading: '', items: [{ question: 'Q', answer: 'A' }] }).problem,
    ).toBeNull();
  });

  it('drops a fully blank row silently', () => {
    // The transient state right after "Add question". Blocking on it would put
    // the form into an error state the PM did not cause.
    expect(
      firstProblem({
        heading: '',
        items: [{ question: 'Q', answer: 'A' }, { question: '', answer: '' }],
      }).problem,
    ).toBeNull();
  });

  it('refuses a half-filled row and names it', () => {
    // The row holds text the PM typed and `faqItemSchema` requires both sides,
    // so dropping it would be silent data loss.
    const withQuestionOnly = firstProblem({
      heading: '',
      items: [{ question: 'Q', answer: 'A' }, { question: 'Orphan?', answer: '' }],
    });
    expect(withQuestionOnly.problem).toBe('half-filled');
    expect(withQuestionOnly.index).toBe(1);

    const withAnswerOnly = firstProblem({
      heading: '',
      items: [{ question: '', answer: 'Orphan.' }],
    });
    expect(withAnswerOnly.problem).toBe('half-filled');
    expect(withAnswerOnly.index).toBe(0);
  });

  it('reports no-items when nothing is complete', () => {
    expect(firstProblem({ heading: '', items: [] }).problem).toBe('no-items');
    expect(
      firstProblem({ heading: '', items: [{ question: '  ', answer: '  ' }] }).problem,
    ).toBe('no-items');
  });
});

describe('FaqForm', () => {
  it('opens a block whose stored content fails its schema, so it can be repaired', () => {
    // This form is the only place to fix an invalid block, so a tolerant parse
    // is the requirement, not a nicety.
    renderForm({ items: [{ question: 'Kept' }], heading: 42 });
    expect(screen.getByDisplayValue('Kept')).toBeInTheDocument();
  });

  it('shows one editable pair for a block with no rows at all', () => {
    renderForm({});
    expect(screen.getByLabelText('Question')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer')).toBeInTheDocument();
  });

  it('writes a schema-valid payload', async () => {
    const user = setupTimers();
    renderForm(ONE_ITEM);

    await user.type(screen.getByLabelText('Heading'), 'Common questions');
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'faq',
      blockOrder: 4,
      content: {
        heading: 'Common questions',
        items: [{ question: 'Is there parking?', answer: 'Yes, one space.' }],
      },
    });
    // Belt and braces: the route runs this same parse and 400s on a miss.
    const written = upsertMock.mock.calls.at(-1)![0].content;
    expect(faqBlockSchema.safeParse(written).success).toBe(true);
  });

  it('omits an empty heading rather than sending an empty string', async () => {
    // `heading` is `min(1)`, so `''` would fail the schema at the route.
    const user = setupTimers();
    renderForm(ONE_ITEM);

    await user.clear(screen.getByLabelText('Answer'));
    await user.type(screen.getByLabelText('Answer'), 'Yes, two spaces.');
    await settleAutosave();

    expect(upsertMock.mock.calls.at(-1)![0].content).not.toHaveProperty('heading');
  });

  it('does not write while a row is half-filled, and says which row', async () => {
    const user = setupTimers();
    renderForm(ONE_ITEM);

    await user.click(screen.getByRole('button', { name: 'Add question' }));
    await user.type(screen.getAllByLabelText('Question')[1]!, 'Orphan?');
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Question 2 needs both/i)).toBeInTheDocument();
  });

  it('resumes writing once the half-filled row is completed', async () => {
    const user = setupTimers();
    renderForm(ONE_ITEM);

    await user.click(screen.getByRole('button', { name: 'Add question' }));
    await user.type(screen.getAllByLabelText('Question')[1]!, 'Orphan?');
    await settleAutosave();
    expect(upsertMock).not.toHaveBeenCalled();

    await user.type(screen.getAllByLabelText('Answer')[1]!, 'Not any more.');
    await settleAutosave();

    expect(upsertMock.mock.calls.at(-1)![0].content).toEqual({
      items: [
        { question: 'Is there parking?', answer: 'Yes, one space.' },
        { question: 'Orphan?', answer: 'Not any more.' },
      ],
    });
  });

  it('explains an all-empty list rather than failing silently', async () => {
    const user = setupTimers();
    renderForm(ONE_ITEM);

    await user.clear(screen.getByLabelText('Question'));
    await user.clear(screen.getByLabelText('Answer'));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one question and answer/i)).toBeInTheDocument();
  });

  it('names remove buttons by position', () => {
    // "Remove" repeated down a list is useless in a screen reader's element
    // list.
    renderForm({
      items: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
      ],
    });
    expect(screen.getByRole('button', { name: 'Remove question 2' })).toBeInTheDocument();
  });

  it('hides the remove control when only one row is left', () => {
    // Removing the last row would leave nothing to type into, and the schema
    // could not be satisfied from that state.
    renderForm(ONE_ITEM);
    expect(screen.queryByRole('button', { name: /Remove question/ })).not.toBeInTheDocument();
  });

  it('stops offering more rows at the schema maximum', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));
    renderForm({ items });
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled();
  });
});
