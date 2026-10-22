import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkSentryInstrumentation } from '../verify-sentry-instrumentation';

/**
 * Fixture tests for `pnpm guard:sentry-instrumentation`. It exists because an
 * `instrumentation.ts` at an app's project root (not `src/`) is silently
 * ignored by Next.js — a ~90-day Sentry blackout — and because web and admin
 * share one Sentry project, so every init must tag its app.
 */
let apps: string;

function write(rel: string, content: string): void {
  const file = join(apps, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const SENTRY_CONFIG = "import { withSentryConfig } from '@sentry/nextjs';\nexport default withSentryConfig({});\n";
const init = (app: string) =>
  `import * as Sentry from '@sentry/nextjs';\nSentry.init({ dsn: 'https://k@o.ingest.sentry.io/1', initialScope: { tags: { app: '${app}' } } });\n`;

/** A correctly instrumented app. */
function sentryApp(app: string): void {
  write(`${app}/next.config.ts`, SENTRY_CONFIG);
  write(`${app}/src/instrumentation.ts`, "export async function register() { await import('./sentry.server.config'); }\n");
  write(`${app}/src/sentry.server.config.ts`, init(app));
}

const output = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
    .map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  apps = join(mkdtempSync(join(tmpdir(), 'sentry-instrumentation-')), 'apps');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dirname(apps), { recursive: true, force: true });
});

describe('checkSentryInstrumentation', () => {
  it('passes on the real repo', () => {
    expect(checkSentryInstrumentation()).toBe(0);
  });

  it('passes (0) on two correctly instrumented, correctly tagged apps', () => {
    sentryApp('web');
    sentryApp('admin');
    expect(checkSentryInstrumentation(apps)).toBe(0);
  });

  it('FAILS (1) when instrumentation.ts sits at the project root, and says to move it', () => {
    sentryApp('web');
    rmSync(join(apps, 'web/src/instrumentation.ts'));
    write('web/instrumentation.ts', 'export async function register() {}\n');
    expect(checkSentryInstrumentation(apps)).toBe(1);
    expect(output()).toContain('Found a stray web/instrumentation.ts at the project root');
  });

  it('FAILS (1) when Sentry.init carries no app tag', () => {
    sentryApp('web');
    write('web/src/sentry.edge.config.ts', "import * as Sentry from '@sentry/nextjs';\nSentry.init({ dsn: 'x' });\n");
    expect(checkSentryInstrumentation(apps)).toBe(1);
    expect(output()).toContain('web/src/sentry.edge.config.ts calls Sentry.init() without an app tag');
  });

  it('FAILS (1) when the tag exists only in a comment', () => {
    sentryApp('web');
    write(
      'web/src/sentry.server.config.ts',
      "import * as Sentry from '@sentry/nextjs';\nSentry.init({\n  dsn: 'https://k@o.ingest.sentry.io/1',\n  // initialScope: { tags: { app: 'web' } },\n});\n",
    );
    expect(checkSentryInstrumentation(apps)).toBe(1);
    expect(output()).toContain('without an app tag');
  });

  it("FAILS (1) when an app tags its events as the OTHER app", () => {
    sentryApp('admin');
    write('admin/src/sentry.server.config.ts', init('web'));
    expect(checkSentryInstrumentation(apps)).toBe(1);
    expect(output()).toContain("tags events as app='web' but lives in apps/admin");
  });

  it('FAILS (1) when an app imports @sentry/nextjs but calls Sentry.init nowhere', () => {
    sentryApp('web');
    rmSync(join(apps, 'web/src/sentry.server.config.ts'));
    expect(checkSentryInstrumentation(apps)).toBe(1);
    expect(output()).toContain('no Sentry.init() call was found');
  });

  it('REFUSES (2) when the apps directory is missing', () => {
    expect(checkSentryInstrumentation(apps)).toBe(2);
  });

  it('REFUSES (2) when no app has a next.config at all (e.g. a renamed config)', () => {
    write('web/src/page.tsx', 'export default function P() { return null; }\n');
    write('web/next.config.mts', SENTRY_CONFIG);
    expect(checkSentryInstrumentation(apps)).toBe(2);
  });
});
