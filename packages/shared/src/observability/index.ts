/**
 * `@propertypro/shared/observability` — telemetry scrubbing shared by both apps.
 *
 * A SUBPATH export, not part of the root barrel: 31 web test files mock
 * `@propertypro/shared` with bare factories, so anything added to the root
 * barrel arrives as `undefined` inside them. A `beforeSend` hook resolving to
 * `undefined` would make Sentry drop every event — silently.
 */
export * from './scrub-browser-event';
