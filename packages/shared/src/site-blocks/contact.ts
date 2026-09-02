/**
 * Contact SoR block — configuration only. Renderer assembles the contact
 * block from the community row + board member rows + management contact
 * rows at render time.
 */
import { z } from 'zod';
import { hiddenSchema } from './types';

export const contactBlockSchema = z
  .object({
    showBoard: z.boolean().default(true),
    showManagement: z.boolean().default(true),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type ContactBlockContent = z.infer<typeof contactBlockSchema>;
