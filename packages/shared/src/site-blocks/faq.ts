/**
 * FAQ block (Pro+) — a heading plus a list of question/answer pairs.
 *
 * Plain text only — no HTML or markdown, sanitization-free by construction
 * (same discipline as the text block).
 */
import { z } from 'zod';

export const faqItemSchema = z
  .object({
    question: z.string().min(1).max(200),
    answer: z.string().min(1).max(2000),
  })
  .strict();

export const faqBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    items: z.array(faqItemSchema).min(1).max(30),
  })
  .strict();

export type FaqItem = z.infer<typeof faqItemSchema>;
export type FaqBlockContent = z.infer<typeof faqBlockSchema>;
