'use client';

import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { faqBlockSchema } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';

const HEADING_MAX = 120;
const QUESTION_MAX = 200;
const ANSWER_MAX = 2000;
const MAX_ITEMS = 30;

interface FaqItemDraft {
  question: string;
  answer: string;
}

interface FaqDraft {
  heading: string;
  items: FaqItemDraft[];
}

function toDraft(content: unknown): FaqDraft {
  const parsed = faqBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      heading: parsed.data.heading ?? '',
      items: parsed.data.items.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(loose.items) ? loose.items : [];
  return {
    heading: typeof loose.heading === 'string' ? loose.heading : '',
    items: rawItems.map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        question: typeof item.question === 'string' ? item.question : '',
        answer: typeof item.answer === 'string' ? item.answer : '',
      };
    }),
  };
}

/** Why this draft cannot be saved yet, if it cannot. */
export type FaqProblem = 'half-filled' | 'no-items' | null;

/**
 * The single rule for what blocks a save, used by BOTH `toCanonical` and the
 * message the PM reads — the same discipline as `AmenitiesForm.firstProblem`,
 * and for the same reason: two copies drift the first time either is edited,
 * and then the form refuses to save without saying why.
 *
 * A FULLY blank row is fine and is dropped silently: that is the transient
 * state right after "Add question", and `faqBlockSchema.items` is `min(1)` so
 * it could never be written anyway.
 *
 * A row with only one side filled is different — it holds text the PM typed,
 * and `faqItemSchema` requires both. Dropping it silently is data loss, so it
 * blocks the save instead. Returns the row index so the message can point at
 * it.
 */
export function firstProblem(draft: FaqDraft): { problem: FaqProblem; index: number } {
  const index = draft.items.findIndex((item) => {
    const q = item.question.trim().length > 0;
    const a = item.answer.trim().length > 0;
    return (q && !a) || (!q && a);
  });
  if (index >= 0) return { problem: 'half-filled', index };
  const hasComplete = draft.items.some(
    (item) => item.question.trim().length > 0 && item.answer.trim().length > 0,
  );
  return { problem: hasComplete ? null : 'no-items', index: -1 };
}

/**
 * `faqBlockSchema.items` is `min(1)`, so a draft whose rows are all blank has
 * nothing valid to write.
 */
function toCanonical(draft: FaqDraft): unknown | null {
  if (firstProblem(draft).problem !== null) return null;

  const items = draft.items
    .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
    // Safe now: `firstProblem` has already refused anything half-filled, so
    // what remains is either complete or genuinely empty.
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
  if (items.length === 0) return null;

  const heading = draft.heading.trim();
  return {
    ...(heading.length > 0 ? { heading } : {}),
    items,
  };
}

/**
 * FAQ block settings — a heading and a list of question/answer pairs.
 *
 * Plain text only, matching the schema: no rich-text editor here, which also
 * keeps TipTap out of a chunk that does not need it.
 */
export function FaqForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'faq', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<FaqDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  // A block with no rows at all still needs one editable pair, or there is
  // nothing to type into and no way to recover.
  const rows = draft.items.length > 0 ? draft.items : [{ question: '', answer: '' }];

  // Read from `draft.items`, which is what `firstProblem` inspects — the
  // synthetic blank `rows` entry above is display-only, and `setRow`
  // materialises it into `draft.items` before anything can be typed into it,
  // so the reported index always matches the rendered row.
  const { problem, index: problemIndex } = firstProblem(draft);
  const headingId = `faq-heading-${blockOrder}`;

  const setRow = (index: number, next: Partial<FaqItemDraft>) =>
    setDraft((prev) => {
      const items = (
        prev.items.length > 0 ? prev.items : [{ question: '', answer: '' }]
      ).slice();
      items[index] = { ...items[index]!, ...next };
      return { ...prev, items };
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          maxLength={HEADING_MAX}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-content">Questions</p>
        <ul className="space-y-3">
          {rows.map((item, index) => {
            const questionId = `faq-question-${blockOrder}-${index}`;
            const answerId = `faq-answer-${blockOrder}-${index}`;
            return (
              <li key={index} className="space-y-2 rounded-md border border-edge p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={questionId} className="text-xs">
                    Question
                  </Label>
                  <Input
                    id={questionId}
                    value={item.question}
                    maxLength={QUESTION_MAX}
                    onChange={(event) => setRow(index, { question: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={answerId} className="text-xs">
                    Answer
                  </Label>
                  <Textarea
                    id={answerId}
                    rows={3}
                    value={item.answer}
                    maxLength={ANSWER_MAX}
                    onChange={(event) => setRow(index, { answer: event.target.value })}
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // Position-bearing, because "Remove" repeated down a list
                    // is useless in a screen reader's element list.
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        items: prev.items.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_ITEMS}
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              items: [
                ...(prev.items.length > 0 ? prev.items : [{ question: '', answer: '' }]),
                { question: '', answer: '' },
              ],
            }))
          }
        >
          Add question
        </Button>

        {isIncomplete && (
          <p className="text-xs text-status-danger">
            {problem === 'half-filled'
              ? `Question ${problemIndex + 1} needs both a question and an answer. Fill in the missing one, or clear the row.`
              : 'Write at least one question and answer before this section can be saved.'}
          </p>
        )}
      </div>
    </div>
  );
}
