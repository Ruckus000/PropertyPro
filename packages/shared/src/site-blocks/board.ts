/**
 * Board members block: the people who hold board seats, shown by name and title.
 *
 * ## It stores a heading, and nothing about any person
 *
 * The members come from the community's board seats when the page renders (the
 * same list the Contact section draws on), so a change of officers shows with no
 * edit here. The schema is `.strict()` so a name, a title or a contact detail
 * cannot be stored in the block and go stale.
 */
import { z } from 'zod';
import { hiddenSchema } from './types';

/**
 * The heading the section shows when the manager has not given it one. The public
 * view draws it, and the editor's form shows it as the placeholder, so both read
 * it here and cannot disagree.
 */
export const DEFAULT_BOARD_HEADING = 'Board of Directors';

export const boardBlockSchema = z
  .object({
    /**
     * Replaces the renderer's default heading. Trimmed before it is measured, so
     * spaces alone are an empty heading rather than a blank one.
     */
    heading: z.string().trim().min(1).max(80).optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type BoardBlockContent = z.infer<typeof boardBlockSchema>;
