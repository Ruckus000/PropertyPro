import React from 'react';
import { transform } from 'sucrase';
import { getTemplateById, isDemoTemplateId } from '@propertypro/shared';

/**
 * Compiles a JSX source string to sanitized static HTML.
 * Pipeline: sucrase transform → Function constructor → React.createElement → ReactDOMServer → DOMPurify
 */
export async function compileJsxToHtml(jsxSource: string): Promise<string> {
  // 1. sucrase transform (jsx + typescript, classic runtime, production)
  const { code: compiledCode } = transform(jsxSource, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
  });

  // 2. Execute via Function constructor
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'React',
    compiledCode + ';\nreturn typeof App !== "undefined" ? React.createElement(App) : null;',
  );
  const element = factory(React);
  if (!element) throw new Error('No App component found in JSX source');

  // 3. Render to static HTML
  const ReactDOMServer = (await import('react-dom/server')).default;
  let html = ReactDOMServer.renderToStaticMarkup(element);

  // 4. Sanitize with isomorphic-dompurify (NOT sanitize-html)
  const DOMPurify = (await import('isomorphic-dompurify')).default;
  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });

  return html;
}

/**
 * Builds and compiles a demo template to HTML.
 * Looks up template by ID, calls build() with context, compiles result.
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

  return compileJsxToHtml(jsxSource);
}
