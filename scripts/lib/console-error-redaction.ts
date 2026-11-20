/**
 * Pure scanner for `guard:console-error-redaction`.
 *
 * Flags server-side `console.error` / `console.warn` calls that pass a raw
 * error value — a bare error-ish identifier, a `.message`/`.stack`/`.cause`
 * read on one, `String(err)`, an errorish property access (`parsed.error`), or
 * an object literal carrying any of those — because that text reaches Vercel
 * function logs UNREDACTED. Drizzle embeds the full SQL and its bound
 * parameter values (tenant emails, tokens, row contents) in `error.message`
 * after a `params: ` marker (#1092); `scrubServerEvent` only scrubs the Sentry
 * event copy and cannot reach the console write (#951 residual).
 *
 * The allowed shapes are `formatErrorForLog(err)` (message redacted, stack
 * frames kept) and `redactParams(str)` — both from
 * `@propertypro/shared/observability`. An argument subtree rooted at either
 * wrapper is clean by contract and is not descended into.
 *
 * Uses the TypeScript parser, not a regex over raw text: console calls span
 * multiple lines, and a quote-delimited regex cannot tell a string from a
 * template literal or a comment (the mistake `guard:legacy-roles` pass 2 and
 * `guard:class-resolution` both document).
 */
import ts from 'typescript';

/** Escape hatch, matching the repo's other guard exemptions. */
export const EXEMPT = 'log-redact:exempt';

/** Wrappers whose return value is log-safe by construction. */
export const ALLOWED_WRAPPERS = new Set(['formatErrorForLog', 'redactParams']);

const BARE_ERROR_NAME = /^(?:e|err|error|exception)$/i;
const ERROR_SUFFIX_NAME = /(?:Err|Error|Exception)$/;

/** Identifier names that read as a caught error value (`err`, `inviteError`, `dbError`, …). */
export function isErrorishName(name: string): boolean {
  return BARE_ERROR_NAME.test(name) || ERROR_SUFFIX_NAME.test(name);
}

/**
 * 'use client' prologue, ignoring leading comments. Same shape as
 * `verify-shared-side-effects.ts`'s directive detection.
 *
 * Why client files are skipped — precisely, because "browser console never
 * reaches Vercel logs" is only half true: client modules ALSO execute on the
 * server during SSR, and their console writes there DO hit function stdout.
 * The skip is still correct because the leak class this guard exists for —
 * drizzle `params:` text — cannot occur in a client module: they hold no
 * database client, their errors are fetch/DOM rejections whose messages carry
 * no bound values, and browser-side events have their own scrubber
 * (`scrubBrowserEvent`).
 */
const CLIENT_DIRECTIVE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/;

/**
 * Files that are browser-only by Next.js convention WITHOUT carrying a 'use
 * client' directive: `instrumentation-client.ts` only ever runs in the
 * browser, so its console writes never reach Vercel function logs.
 */
const CLIENT_ONLY_BASENAMES = new Set(['instrumentation-client.ts']);

export interface ScanViolation {
  line: number;
  text: string;
}

export interface ScanResult {
  violations: ScanViolation[];
  /** console.error/warn call sites examined — the guard's denominator. */
  sites: number;
  /** True when the TS parser reported syntax errors: refuse to vouch. */
  parseFailed: boolean;
  /** True when the file is a client component (skipped entirely). */
  isClient: boolean;
}

function unwrap(node: ts.Node): ts.Node {
  let n = node;
  for (;;) {
    if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) {
      n = (n as ts.AsExpression | ts.TypeAssertion).expression;
    } else if (ts.isNonNullExpression(n)) {
      n = n.expression;
    } else if (ts.isParenthesizedExpression(n)) {
      n = n.expression;
    } else {
      return n;
    }
  }
}

function isAllowedWrapperCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrap(node.expression);
  return ts.isIdentifier(callee) && ALLOWED_WRAPPERS.has(callee.text);
}

/** Violation shapes at THIS node, without descending. */
function isDirectViolation(node: ts.Node): boolean {
  const n = unwrap(node);
  if (ts.isIdentifier(n)) return isErrorishName(n.text);
  if (ts.isShorthandPropertyAssignment(n)) return isErrorishName(n.name.text);
  if (ts.isPropertyAccessExpression(n)) {
    const prop = n.name.text;
    const obj = unwrap(n.expression);
    // ANY property read on an error-ish object: not just `.message`/`.stack`,
    // because postgres.js puts the value-carrying text in `.detail`, and
    // DrizzleQueryError exposes `.query`/`.params` as own properties. The
    // logged value is derived from the error either way. (`error.fields` in
    // error-handler.ts is the known benign shape — baselined, and exempt-able.)
    if (ts.isIdentifier(obj) && isErrorishName(obj.text)) return true;
    // `parsed.error`, `result.err` — a caught/vendor error handed straight to
    // the log. Often a string, but just as often the raw Error (Zod) or a
    // vendor message carrying values; the baseline absorbs the benign ones.
    if (isErrorishName(prop)) return true;
    return false;
  }
  if (ts.isCallExpression(n)) {
    const callee = unwrap(n.expression);
    // `String(err)` — the interpolation idiom that carries the same text.
    if (
      ts.isIdentifier(callee)
      && callee.text === 'String'
      && n.arguments.length === 1
      && isDirectViolation(n.arguments[0]!)
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * True when this argument subtree would log raw error text. Descends through
 * object literals, templates, JSON.stringify and binary expressions, but
 * NEVER into an allowed-wrapper call (clean by contract) or a function body
 * (an arrow's parameter named `e` is not the value being logged).
 */
function argLeaks(node: ts.Node): boolean {
  if (isAllowedWrapperCall(node)) return false;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false;
  if (isDirectViolation(node)) return true;
  // A property's NAME is a key, not a logged value: `{ error: message }` must
  // be judged by its initializer alone. (ShorthandPropertyAssignment has no
  // split — its name IS the value — and isDirectViolation handles it above.)
  if (ts.isPropertyAssignment(node)) return argLeaks(node.initializer);
  let found = false;
  node.forEachChild((child) => {
    if (!found && argLeaks(child)) found = true;
  });
  return found;
}

function isConsoleErrorCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee)
    && ts.isIdentifier(callee.expression)
    && callee.expression.text === 'console'
    && (callee.name.text === 'error' || callee.name.text === 'warn')
  );
}

export function scanSource(filePath: string, source: string): ScanResult {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1);
  const isClient = CLIENT_ONLY_BASENAMES.has(base) || CLIENT_DIRECTIVE.test(source);
  if (isClient) {
    return { violations: [], sites: 0, parseFailed: false, isClient: true };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
  const parseFailed =
    ((sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length ?? 0) > 0;

  const lines = source.split('\n');
  const lineAt = (pos: number) =>
    sourceFile.getLineAndCharacterOfPosition(pos).line + 1; // 1-based

  const violations: ScanViolation[] = [];
  let sites = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isConsoleErrorCall(node)) {
      sites += 1;
      const leaking = node.arguments.some(argLeaks);
      if (leaking) {
        const callLine = lineAt(node.getStart(sourceFile));
        const argLines = node.arguments.map((a) => lineAt(a.getStart(sourceFile)));
        // Exemption on the call's first line or on the offending argument's line.
        const exempt = [callLine, ...argLines].some((ln) => (lines[ln - 1] ?? '').includes(EXEMPT));
        if (!exempt) {
          violations.push({
            line: callLine,
            text: (lines[callLine - 1] ?? '').trim().slice(0, 160),
          });
        }
      }
      return; // nothing inside a console call is another logged value
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);

  return { violations, sites, parseFailed, isClient: false };
}
