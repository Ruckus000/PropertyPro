'use client';

/**
 * Route-level error boundary for /billing.
 *
 * Without this, a Stripe outage fell through to the shared `app/error.tsx` and
 * rendered "something went wrong" — true, unhelpful, and a dead end. Everything
 * on this page comes from one upstream, and the console already has a screen
 * whose entire job is answering "is Stripe up": Health. So the error here names
 * the dependency and points at that screen, which is what
 * `.claude/rules/design.md` asks of an error message — what happened, and what
 * to do.
 *
 * The mode-mismatch refusal is NOT this path. That one is a legible message the
 * page renders inline, because it is a configuration the operator can fix rather
 * than a failure.
 *
 * `AlertBanner` derives its own icon from `status`; it takes no `icon` prop.
 */
import Link from 'next/link';
import { AlertBanner, Button, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

export default function BillingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageBody>
      <AdminPageHeader title="Billing" />
      <AlertBanner
        status="danger"
        title="We couldn't load billing"
        description="Subscriptions are read live from Stripe, so this usually means Stripe is unreachable rather than anything being wrong with an account. Health shows whether Stripe is responding."
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/health">Check Health</Link>
            </Button>
          </div>
        }
      />
    </PageBody>
  );
}
