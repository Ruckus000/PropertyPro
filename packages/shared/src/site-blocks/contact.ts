/**
 * Contact SoR block — configuration only. Renderer assembles the contact
 * block from the community row + board member rows + management contact
 * rows at render time.
 */
import { z } from 'zod';

export const contactBlockSchema = z
  .object({
    showBoard: z.boolean().default(true),
    showManagement: z.boolean().default(true),
  })
  .strict();

export type ContactBlockContent = z.infer<typeof contactBlockSchema>;
