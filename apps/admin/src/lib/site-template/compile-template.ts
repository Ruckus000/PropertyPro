import { createContext, runInNewContext } from 'node:vm';
import React from 'react';
import { transform } from 'sucrase';
import { getTemplateById, isDemoTemplateId } from '@propertypro/shared';

export interface TemplateCompileContext {
  communityName?: string;
}

export interface TemplateCompileDiagnostic {
  stage: 'compile' | 'runtime';
  message: string;
  line?: number;
  column?: number;
  excerpt?: string;
}

export interface CompileJsxResult {
  html?: string;
  errors?: TemplateCompileDiagnostic[];
}

function extractLocation(message: string): Pick<TemplateCompileDiagnostic, 'line' | 'column'> {
  const lineColumnMatch = message.match(/(?:line|Line)\s+(\d+)(?:[^\d]+(?:column|Column)\s+(\d+))?/);
  if (lineColumnMatch) {
    return {
      line: Number(lineColumnMatch[1]),
      column: lineColumnMatch[2] ? Number(lineColumnMatch[2]) : undefined,
    };
  }

  const tupleMatch = message.match(/\((\d+):(\d+)\)/);
  if (tupleMatch) {
    return {
      line: Number(tupleMatch[1]),
      column: Number(tupleMatch[2]),
    };
  }

  return {};
}

function toRuntimeMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  // Cross-realm errors are NOT `instanceof Error` here. Template code runs in a
  // vm context (see `runTemplateFactory`), so anything it throws — including the
  // timeout abort — is an instance of *that* context's Error constructor, and
  // the prototype check fails. Without this branch every template runtime error
  // collapsed to the generic string below and the editor's diagnostics panel
  // showed nothing useful.
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return 'Template execution failed';
}

/**
 * Escape a value so it cannot break out of a single-quoted JavaScript string
 * literal in generated template source.
 *
 * Every demo template builds its JSX by interpolating context values directly
 * into `'...'` literals — e.g. `fontFamily: '${fontBody}'`,
 * `React.createElement('h1', ..., '${communityName}')`. That source is then
 * handed to `new Function()`, so a single apostrophe in any interpolated value
 * terminates the literal early and everything after it is executed as code.
 *
 * This is applied ONCE here, at the only place context values enter
 * `template.build()`, rather than at the several hundred interpolation sites
 * across the twelve template files. Escaping at the boundary means a template
 * added later is covered automatically; escaping at the call sites would mean
 * every new template is a fresh opportunity to forget.
 *
 * Note this is the PRIMARY control, not the schema validation on the routes.
 * `communityName` / `prospectName` are necessarily free text, so no allowlist
 * can cover them — colors and fonts are separately allowlisted as defence in
 * depth.
 *
 * `$` is escaped as well: harmless inside a single-quoted literal, but it
 * neutralises `${...}` should any generated fragment ever land in a template
 * literal. Angle brackets become unicode escapes so an interpolated value
 * cannot close a `<\/script>` tag in the rendered output.
 */
export function escapeForJsStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E');
}

/** Wall-clock ceiling for evaluating one template. */
const TEMPLATE_EVAL_TIMEOUT_MS = 2_000;

/**
 * Evaluate compiled template code in a fresh V8 context and return its element.
 *
 * ## What this buys, measured
 *
 * Replacing `new Function('React', 'PP_TEMPLATE', code)` with a vm context
 * gives exactly two things. Both were verified against Node 20 rather than
 * assumed:
 *
 * 1. **No ambient globals.** The sandbox object below is the whole global scope
 *    the template sees, so `process`, `require`, `module` and `Buffer` are all
 *    `undefined`. This holds even for the component body, which React invokes
 *    from the host realm during `renderToStaticMarkup` — identifier resolution
 *    is lexical, so it still walks the sandbox's scope chain. That closes the
 *    accidental path to `SUPABASE_SERVICE_ROLE_KEY`.
 * 2. **A bound on module-level evaluation.** `new Function` could not be
 *    interrupted at all; `timeout` aborts a top-level `while(true){}`.
 *
 * ## What it does NOT buy — read this before relying on it
 *
 * This is hardening, **not a security boundary**:
 *
 * - **A host function reference is an escape hatch.** `React` is a main-realm
 *   object, so `React.createElement.constructor('return process')()` returns
 *   the real `process`. Verified: it does. Any template author who wants out
 *   gets out. Passing React is unavoidable without a worker, so this is
 *   inherent to the approach, not an oversight to fix in place.
 * - **The timeout does not cover rendering.** It bounds the `runInNewContext`
 *   call, which only *creates* the element. The component body runs later,
 *   inside `renderToStaticMarkup`, in the host realm's time budget — a
 *   `while(true){}` inside `App()` still wedges the request. Measured.
 * - It bounds neither memory nor I/O.
 *
 * The real control on this surface is upstream: `compileDemoTemplate` accepts
 * only ids from the fixed first-party registry, so no caller-supplied JSX ever
 * reaches the evaluator. If that ever changes, this needs to move to a worker
 * or subprocess with its own resource limits — a vm context will not do.
 *
 * ## Why the elements still render
 *
 * React's brand check is `Symbol.for('react.element')`, and `Symbol.for` is
 * cross-realm by design, so elements built in the sandbox pass validation in
 * the host. Pinned by a test over every registry template.
 */
function runTemplateFactory(
  compiledCode: string,
  templateContext: TemplateCompileContext,
): React.ReactElement | null {
  const sandbox: Record<string, unknown> = {
    React,
    PP_TEMPLATE: templateContext,
  };

  const source = `${compiledCode};\ntypeof App !== "undefined" ? React.createElement(App) : null;`;

  return runInNewContext(source, createContext(sandbox), {
    timeout: TEMPLATE_EVAL_TIMEOUT_MS,
    displayErrors: true,
  }) as React.ReactElement | null;
}

/**
 * Compiles a JSX source string to sanitized static HTML.
 * Pipeline: sucrase transform -> vm.runInNewContext -> React.createElement ->
 * ReactDOMServer -> sanitize-html
 *
 * SECURITY: this evaluates template source. It is reachable only from
 * platform-admin-gated routes, and the evaluation is confined to a fresh V8
 * context with a timeout (see `runTemplateFactory`). Do not expose it to
 * non-admin input without moving the evaluation to a worker or subprocess —
 * a V8 context bounds ambient reach, not memory, and is not an isolate.
 */
export async function compileJsxToHtmlDetailed(
  jsxSource: string,
  options: { templateContext?: TemplateCompileContext } = {},
): Promise<CompileJsxResult> {
  const templateContext = {
    communityName: options.templateContext?.communityName ?? 'Community Name',
  };

  let compiledCode: string;

  try {
    const transformed = transform(jsxSource, {
      transforms: ['jsx', 'typescript'],
      jsxRuntime: 'classic',
      production: true,
    });
    compiledCode = transformed.code;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Template compilation failed';
    return {
      errors: [
        {
          stage: 'compile',
          message,
          ...extractLocation(message),
        },
      ],
    };
  }

  let element: React.ReactElement | null;

  try {
    element = runTemplateFactory(compiledCode, templateContext);
    if (!element) {
      return {
        errors: [
          {
            stage: 'runtime',
            message: 'No App component found in JSX source',
          },
        ],
      };
    }
  } catch (error) {
    return {
      errors: [
        {
          stage: 'runtime',
          message: toRuntimeMessage(error),
        },
      ],
    };
  }

  try {
    const ReactDOMServer = (await import('react-dom/server')).default;
    const sanitizeHtml = (await import('sanitize-html')).default;

    let html = ReactDOMServer.renderToStaticMarkup(element);

    html = sanitizeHtml(html, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['style', 'html', 'head', 'body']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        '*': ['class', 'id', 'style', 'target', 'rel'],
      },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
      },
    });

    return { html };
  } catch (error) {
    return {
      errors: [
        {
          stage: 'runtime',
          message: toRuntimeMessage(error),
        },
      ],
    };
  }
}

export async function compileJsxToHtml(
  jsxSource: string,
  options: { templateContext?: TemplateCompileContext } = {},
): Promise<string> {
  const result = await compileJsxToHtmlDetailed(jsxSource, options);

  if (!result.html) {
    throw new Error(result.errors?.[0]?.message ?? 'Template compilation failed');
  }

  return result.html;
}

/**
 * Builds and compiles a code-backed demo template to HTML.
 * This remains for compatibility while the runtime public template registry is
 * being removed from the admin demo flow.
 */
export async function compileDemoTemplate(params: {
  templateId: string;
  communityName: string;
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;
    fontBody: string;
  };
}): Promise<string> {
  if (!isDemoTemplateId(params.templateId) || !getTemplateById(params.templateId)) {
    throw new Error(`Unknown template: ${params.templateId}`);
  }

  const template = getTemplateById(params.templateId)!;

  // Escape BEFORE the template interpolates these into JS source. The branding
  // fields are already allowlisted by the routes' Zod schemas, but
  // communityName is free text and cannot be — and `build()` puts all of them
  // inside single-quoted literals that `new Function()` then evaluates.
  const jsxSource = template.build({
    communityName: escapeForJsStringLiteral(params.communityName),
    branding: params.branding && {
      primaryColor: escapeForJsStringLiteral(params.branding.primaryColor),
      secondaryColor: escapeForJsStringLiteral(params.branding.secondaryColor),
      accentColor: escapeForJsStringLiteral(params.branding.accentColor),
      fontHeading: escapeForJsStringLiteral(params.branding.fontHeading),
      fontBody: escapeForJsStringLiteral(params.branding.fontBody),
    },
  });

  return compileJsxToHtml(jsxSource, {
    templateContext: { communityName: params.communityName },
  });
}
