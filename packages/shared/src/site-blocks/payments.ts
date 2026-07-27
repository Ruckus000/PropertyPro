/**
 * Payments block — a single prominent "pay your assessment" panel.
 *
 * ## The block never takes a payment
 *
 * It renders a link, and nothing else. That is deliberate and it is what keeps
 * v3's "no card details touch your website" copy literally true: whether the
 * target is the resident portal or a third-party processor, the payment
 * happens somewhere else entirely. Nothing here collects, stores or forwards
 * card data.
 *
 * ## Why the target is optional
 *
 * With no `ctaTarget`, the renderer deep-links to the community's own portal
 * at `/payments` via `buildCommunityUrl` — the right default for associations
 * that collect through PropertyPro.
 *
 * Most Florida associations do not: ClickPay, Zego and PayLease between them
 * cover the majority. A portal-only link would make the block unusable for
 * them, so a PM may supply an override, validated by the SAME `ctaTargetSchema`
 * the hero's CTA uses. That schema already normalises backslashes and rejects
 * anything resolving protocol-relative, so `//evil.com`, `/\evil.com` and
 * `\\evil.com` are refused along with `javascript:` and bare `http://`.
 * Reusing it rather than writing a second URL validator is the point.
 */
import { z } from 'zod';
import { ctaTargetSchema } from './types';

export const paymentsBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    body: z.string().min(1).max(600).optional(),
    ctaText: z.string().min(1).max(40).optional(),
    /**
     * Optional override. Absent means "the community's own portal", resolved
     * at render time — storing the resolved URL would bake in the community's
     * current slug and silently break every payments block on a rename.
     */
    ctaTarget: ctaTargetSchema.optional(),
  })
  .strict();

export type PaymentsBlockContent = z.infer<typeof paymentsBlockSchema>;
