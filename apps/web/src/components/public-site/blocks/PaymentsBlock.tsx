/**
 * PaymentsBlock — a single "pay your assessment" panel.
 *
 * It renders a LINK. It never collects, stores or forwards payment details,
 * which is what keeps v3's "no card details touch your website" copy true
 * whichever target is in play.
 */
import { paymentsBlockSchema, type PaymentsBlockContent } from '@propertypro/shared';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import type { BlockRendererProps } from './types';

const DEFAULT_HEADING = 'Pay your assessment';
const DEFAULT_CTA_TEXT = 'Make a payment';

/**
 * An absent `ctaTarget` resolves to the community's own resident portal.
 *
 * Resolved at RENDER time rather than stored: baking the URL into block
 * content would freeze the community's current slug, and every payments block
 * would quietly point at a dead host after a rename.
 */
function resolveTarget(content: PaymentsBlockContent, slug: string): string {
  return content.ctaTarget ?? buildCommunityUrl(slug, '/payments');
}

/**
 * External targets get `rel="noopener noreferrer"`; internal paths must not.
 *
 * `ctaTargetSchema` already guarantees the value is either a path starting
 * with `/` or an `https://` URL — it normalises backslashes and rejects
 * anything resolving protocol-relative — so this only has to distinguish the
 * two, not re-validate. The portal default is an absolute URL on a sibling
 * subdomain, so it counts as external too.
 */
function isExternal(target: string): boolean {
  return !target.startsWith('/');
}

export function PaymentsBlock(props: BlockRendererProps) {
  const parsed = paymentsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn('payments block content failed Zod validation; skipping render', {
      blockId: props.block.id,
      communityId: props.community.id,
      issues: parsed.error.issues,
    });
    return null;
  }
  const content: PaymentsBlockContent = parsed.data;

  const target = resolveTarget(content, props.community.slug);
  const external = isExternal(target);
  const headingId = `payments-${props.block.id}`;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={headingId}>
      <div className="mx-auto max-w-3xl rounded-md border border-edge bg-surface-card p-8 text-center">
        <h2 id={headingId} className="font-heading text-2xl font-semibold text-content">
          {content.heading ?? DEFAULT_HEADING}
        </h2>
        {content.body && (
          <p className="mt-3 text-base text-content-secondary">{content.body}</p>
        )}
        <div className="mt-6">
          <a
            href={target}
            {...(external
              ? {
                  target: '_blank',
                  // noopener blocks window.opener reverse-tabnabbing;
                  // noreferrer stops leaking the community's URL to the
                  // processor. Never applied to internal paths.
                  rel: 'noopener noreferrer',
                }
              : {})}
            className="inline-flex items-center rounded-md bg-interactive px-6 py-3 text-base font-medium text-content-inverse transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {content.ctaText ?? DEFAULT_CTA_TEXT}
            {external && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        </div>
        <p className="mt-4 text-xs text-content-secondary">
          Payments are handled on a secure payment page. No card details are entered on
          this website.
        </p>
      </div>
    </section>
  );
}
