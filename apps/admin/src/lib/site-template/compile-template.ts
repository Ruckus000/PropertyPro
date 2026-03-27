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

  return 'Template execution failed';
}

/**
 * Compiles a JSX source string to sanitized static HTML.
 * Pipeline: sucrase transform -> Function constructor -> React.createElement ->
 * ReactDOMServer -> sanitize-html
 *
 * SECURITY: This executes arbitrary code via `new Function()` in the Node.js
 * process with NO sandbox. Only platform-admin-authored templates should reach
 * this function. A compromised admin session can achieve full server-side RCE.
 * The sanitize-html step protects the *output* HTML but not the *execution*.
 *
 * If this function is ever exposed to non-admin users, it MUST be moved to an
 * isolated VM (e.g., `vm.runInNewContext` with timeout, or a worker process).
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
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'React',
      'PP_TEMPLATE',
      `${compiledCode};\nreturn typeof App !== "undefined" ? React.createElement(App) : null;`,
    ) as (react: typeof React, template: TemplateCompileContext) => React.ReactElement | null;

    element = factory(React, templateContext);
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
  const jsxSource = template.build({
    communityName: params.communityName,
    branding: params.branding,
  });

  return compileJsxToHtml(jsxSource, {
    templateContext: { communityName: params.communityName },
  });
}
