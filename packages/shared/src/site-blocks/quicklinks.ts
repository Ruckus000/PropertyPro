/**
 * Quick links block: a row of shortcuts to the other sections on the page.
 *
 * ## It stores nothing but "hidden"
 *
 * Which links appear, and where each one points, is decided when the page
 * renders: a link shows only when its section is on the page and has something
 * to show, and Owner sign in always shows. A stored link list would be a second
 * place for a target to go stale, so the schema is `.strict()` and refuses one.
 */
import { z } from 'zod';
import { hiddenSchema } from './types';

export const quicklinksBlockSchema = z
  .object({
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type QuicklinksBlockContent = z.infer<typeof quicklinksBlockSchema>;
