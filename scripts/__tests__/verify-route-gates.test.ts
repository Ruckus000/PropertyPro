import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CannotCheckError,
  GATE_HELPERS,
  analyzeRouteFile,
  checkGateHelpers,
  checkRouteGates,
} from '../verify-route-gates';

/**
 * Unit tests for `pnpm guard:route-gates`, in the three directions
 * `.claude/rules/verification.md` asks for — passes on the real repo, fails on
 * an injected violation, refuses (2) when it cannot check — plus the F3 case the
 * guard exists for: one gated verb must not cover its ungated sibling.
 */
const GATES = new Set(['requirePermission', 'requireFinanceWritePermission']);

function analyze(source: string, gates: ReadonlySet<string> = GATES) {
  return analyzeRouteFile('route.ts', source, gates);
}

const statuses = (source: string, gates?: ReadonlySet<string>) =>
  Object.fromEntries(analyze(source, gates).verbs.map((v) => [v.verb, v.status]));

describe('analyzeRouteFile', () => {
  it('flags a verb that calls no gate and carries no claim', () => {
    const result = analyze(`export const GET = withErrorHandler(async () => listThings());`);
    expect(result.verbs).toEqual([{ verb: 'GET', status: 'ungated' }]);
    expect(result.problems[0]).toMatch(/^GET: calls no gate/);
  });

  it('accepts the same verb once it carries a well-formed claim', () => {
    const result = analyze(
      `// route-gate: self-scoped — reads only the caller's own rows\n` +
        `export const GET = withErrorHandler(async () => listMine());`,
    );
    expect(result.problems).toEqual([]);
    expect(result.verbs).toEqual([{ verb: 'GET', status: 'annotated', gateClass: 'self-scoped' }]);
  });

  it('F3: a gated POST does not cover an ungated GET in the same file', () => {
    // The shape of GET /onboarding/condo before #1199: the mutations were gated,
    // the read was not. A per-file check passes this.
    const source =
      `export async function GET() { return getOrCreateWizardState(); }\n` +
      `export async function POST() { requirePermission(m, 'settings', 'write'); }`;
    const result = analyze(source);
    expect(statuses(source)).toEqual({ GET: 'ungated', POST: 'helper' });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^GET: calls no gate/);
  });

  it('does not count a gate that is only named in a comment or a string', () => {
    const result = analyze(
      `export const GET = withErrorHandler(async () => {\n` +
        `  // requirePermission(membership, 'documents', 'read') happens upstream\n` +
        `  return log('requirePermission(m)');\n` +
        `});`,
    );
    expect(result.verbs[0]?.status).toBe('ungated');
  });

  it('follows the verb into same-file helpers and constants', () => {
    expect(
      statuses(
        `async function authorize(m) { requirePermission(m, 'finance', 'read'); }\n` +
          `const handler = async () => { await authorize(m); };\n` +
          `export const GET = withErrorHandler(handler);`,
      ),
    ).toEqual({ GET: 'helper' });
  });

  it('does NOT credit a ForbiddenError guarded by a feature/type check (the F3 near-miss)', () => {
    // GET /onboarding/condo calls a local requireCondoCommunity() that throws
    // ForbiddenError on community TYPE. Crediting any inline ForbiddenError let
    // it stand in for the removed role gate — the guard's own revert-check
    // caught that, and this case pins it.
    expect(
      statuses(
        `function requireCondoCommunity(t) {\n` +
          `  if (!['condo_718', 'hoa_720'].includes(t)) { throw new ForbiddenError('condo only'); }\n` +
          `}\n` +
          `export async function GET() { requireCondoCommunity(m.communityType); }\n` +
          `export async function POST() { if (!features.hasCompliance) throw new ForbiddenError('x'); }\n` +
          `export async function PUT() { throw new ForbiddenError('no condition at all'); }`,
      ),
    ).toEqual({ GET: 'ungated', POST: 'ungated', PUT: 'ungated' });
  });

  it('credits an inline ForbiddenError whose condition names a role or ownership', () => {
    expect(
      statuses(
        `export async function GET() { if (!isAdminRole(membership.role)) throw new ForbiddenError('x'); }\n` +
          `export async function POST() { if (row.hostUserId !== actorUserId) { throw new ForbiddenError('x'); } }`,
      ),
    ).toEqual({ GET: 'inline', POST: 'inline' });
  });

  it('credits an inline `throw new ForbiddenError` and a token verifier', () => {
    expect(
      statuses(
        `export async function PATCH() { if (!m.isAdmin) { throw new ForbiddenError('no'); } }\n` +
          `export async function POST() { verifySnowbirdUnsubscribeToken(t); }`,
      ),
    ).toEqual({ PATCH: 'inline', POST: 'token' });
  });

  it('a claim above one verb does not cover the next one', () => {
    const source =
      `// route-gate: public — static liveness payload, reads nothing\n` +
      `export async function GET() {}\n` +
      `export async function POST() {}`;
    const result = analyze(source);
    expect(statuses(source)).toEqual({ GET: 'annotated', POST: 'ungated' });
    expect(result.problems).toEqual([expect.stringMatching(/^POST: calls no gate/)]);
  });

  it('rejects a claim that attaches to no verb (e.g. in the file header)', () => {
    const result = analyze(
      `// route-gate: public — static liveness payload, reads nothing\n` +
        `import { x } from 'y';\n` +
        `export async function GET() {}`,
    );
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/line 1: route-gate claim is not directly above/)]),
    );
  });

  it.each([
    ['unknown class', `// route-gate: members — anyone in the community`, /unknown class "members"/],
    ['short reason', `// route-gate: public — ok`, /must justify/],
    ['TODO reason', `// route-gate: public — TODO`, /must justify/],
    ['malformed', `// route-gate: public`, /malformed/],
  ])('rejects a claim with %s', (_label, claim, message) => {
    const result = analyze(`${claim}\nexport async function GET() {}`);
    expect(result.verbs[0]?.status).toBe('ungated');
    expect(result.problems[0]).toMatch(message);
  });

  it('rejects a stale claim on a verb that is already gated', () => {
    const result = analyze(
      `// route-gate: community-open — any member may read this list\n` +
        `export async function GET() { requirePermission(m, 'documents', 'read'); }`,
    );
    expect(result.problems[0]).toMatch(/already gated \(helper\) — delete the stale claim/);
  });

  it('resolves `export { local as VERB }` and needs a claim when the local is imported', () => {
    expect(
      statuses(`import { handleOptions } from './cors';\nexport { handleOptions as OPTIONS };`),
    ).toEqual({ OPTIONS: 'ungated' });
    expect(
      statuses(
        `function opts() { requirePermission(m, 'a', 'b'); }\nexport { opts as OPTIONS };`,
      ),
    ).toEqual({ OPTIONS: 'helper' });
  });

  it.each([
    ['a re-export from another module', `export { GET } from './impl';`],
    ['export *', `export * from './impl';`],
    ['a destructured export', `export const { GET, POST } = handlers;`],
    ['a file that does not parse', `export const GET = (;`],
  ])('REFUSES (throws CannotCheckError) on %s', (_label, source) => {
    expect(() => analyze(source)).toThrow(CannotCheckError);
  });

  it('anti-vacuity: the same fixture goes red when its helper leaves the list', () => {
    const source = `export async function POST() { requireFinanceWritePermission(m); }`;
    expect(statuses(source)).toEqual({ POST: 'helper' });
    expect(statuses(source, new Set(['requirePermission']))).toEqual({ POST: 'ungated' });
  });
});

describe('checkGateHelpers', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'route-gates-helpers-'));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  const write = (rel: string, content: string) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), content);
  };

  it('rejects a listed helper that refuses no one (the requireReservationPermission shape)', () => {
    write(
      'lib/gates.ts',
      `export function realGate(m) { if (!m.ok) throw new Error('no'); }\n` +
        `export function wrapsGate(m) { realGate(m); }\n` +
        `export function noOp(_m) { /* kept for call-site compatibility */ }\n`,
    );
    const problems = checkGateHelpers(base, [
      { name: 'realGate', file: 'lib/gates.ts' },
      { name: 'wrapsGate', file: 'lib/gates.ts' },
      { name: 'noOp', file: 'lib/gates.ts' },
    ]);
    expect(problems).toEqual([expect.stringMatching(/noOp .* refuses no one/)]);
  });

  it('REFUSES when an entry names a file or function that does not exist', () => {
    write('lib/gates.ts', `export function realGate(m) { throw new Error('x'); }\n`);
    expect(() => checkGateHelpers(base, [{ name: 'gone', file: 'lib/gates.ts' }])).toThrow(
      CannotCheckError,
    );
    expect(() => checkGateHelpers(base, [{ name: 'realGate', file: 'lib/missing.ts' }])).toThrow(
      CannotCheckError,
    );
  });

  it('every real GATE_HELPERS entry exists and can refuse', () => {
    const repoRoot = join(__dirname, '..', '..');
    expect(checkGateHelpers(repoRoot, GATE_HELPERS)).toEqual([]);
  });
});

describe('checkRouteGates', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'route-gates-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
  });

  const writeRoute = (relDir: string, content: string) => {
    const file = join(base, 'apps/web/src/app/api', relDir, 'route.ts');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const logged = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
  const errors = () => vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');

  it('passes on the real repo and prints a non-zero denominator', () => {
    expect(checkRouteGates()).toBe(0);
    const verbs = Number(logged().match(/(\d+) exported verbs/)?.[1] ?? 0);
    expect(verbs).toBeGreaterThan(0);
  });

  it('fails (1) on an injected ungated verb, naming the file and verb', () => {
    writeRoute('v1/widgets', `export async function GET() { return listWidgets(); }`);
    expect(checkRouteGates(base, [])).toBe(1);
    expect(errors()).toMatch(/v1\/widgets\/route\.ts: GET: calls no gate/);
  });

  it('passes (0) on a tree where every verb is gated or claimed', () => {
    writeRoute(
      'v1/widgets',
      `// route-gate: community-open — any member may list widgets\nexport async function GET() {}\n` +
        `export async function POST() { if (!membership.isAdmin) throw new ForbiddenError('no'); }`,
    );
    expect(checkRouteGates(base, [])).toBe(0);
  });

  it('REFUSES (2) when the scan root does not exist', () => {
    expect(checkRouteGates(base, [])).toBe(2);
    expect(errors()).toContain('scan root apps/web/src/app/api does not exist');
  });

  it('REFUSES (2) when the scan root holds no route files', () => {
    mkdirSync(join(base, 'apps/web/src/app/api/v1/widgets'), { recursive: true });
    expect(checkRouteGates(base, [])).toBe(2);
    expect(errors()).toContain('found 0 route files');
  });

  it('REFUSES (2) when route files export no verbs at all', () => {
    writeRoute('v1/widgets', `export const dynamic = 'force-dynamic';`);
    expect(checkRouteGates(base, [])).toBe(2);
    expect(errors()).toContain('exported 0 HTTP verbs');
  });

  it('REFUSES (2) when a GATE_HELPERS entry points at nothing', () => {
    writeRoute('v1/widgets', `export async function GET() { requireGone(m); }`);
    expect(checkRouteGates(base, [{ name: 'requireGone', file: 'lib/nope.ts' }])).toBe(2);
  });
});
