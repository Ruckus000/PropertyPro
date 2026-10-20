/**
 * Sentry server (Node.js runtime) configuration for apps/web. The shared options live in
 * `serverSentryOptions` (@propertypro/shared/observability); this file adds
 * only the app tag, which `guard:sentry-instrumentation` requires as a literal.
 */
import * as Sentry from '@sentry/nextjs';

import { serverSentryOptions } from '@propertypro/shared/observability';

Sentry.init({
  ...serverSentryOptions(),
  // `initialScope` rather than a post-init setTag, so the very first event is tagged.
  initialScope: { tags: { app: 'web' } },
});
