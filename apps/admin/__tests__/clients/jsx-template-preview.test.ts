/**
 * Unit tests for the preview iframe srcdoc builder.
 *
 * Verifies that buildPreviewSrcdoc produces safe, well-structured HTML
 * with proper XSS prevention and error handling.
 */
import { describe, it, expect } from 'vitest';
import { buildPreviewSrcdoc } from '../../src/components/clients/JsxTemplateEditor';

describe('buildPreviewSrcdoc', () => {
  it('produces valid HTML with loading indicator', () => {
    const html = buildPreviewSrcdoc('function App() { return <div>Hello</div>; }');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div id="root">');
    expect(html).toContain('Loading preview');
  });

  it('uses pinned CDN versions via jsdelivr', () => {
    const html = buildPreviewSrcdoc('');
    expect(html).toContain('@babel/standalone@7.26.10');
    // React 19 dropped UMD builds; preview uses React 18 UMD
    expect(html).toContain('react@18.3.1');
    expect(html).toContain('react-dom@18.3.1');
    expect(html).toContain('cdn.jsdelivr.net');
  });

  it('includes error handler', () => {
    const html = buildPreviewSrcdoc('');
    expect(html).toContain('window.onerror');
    expect(html).toContain('showError');
  });

  it('safely encodes </script> in JSX source preventing HTML breakout', () => {
    const malicious = 'console.log("</script><script>alert(1)</script>")';
    const html = buildPreviewSrcdoc(malicious);

    // The </ sequences in the source must be escaped as <\/ so the HTML parser
    // does not interpret them as closing tags. The only real </script> should be
    // the one closing the bootstrap script (escaped as <\/script> in the template
    // literal, which becomes </script> in the output).
    const rawScriptCloses = html.match(/<\/script>/gi) || [];
    expect(rawScriptCloses.length).toBe(1); // only the legitimate closing tag

    // The malicious source should appear with escaped <\/ sequences
    expect(html).toContain('<\\/script>');
  });

  it('safely handles backticks and template literals in source', () => {
    const source = 'const x = `hello ${world}`;';
    const html = buildPreviewSrcdoc(source);
    // Backticks are safe inside JSON double-quoted strings — no special escaping needed.
    // Just verify the HTML is well-formed and contains the source.
    expect(html).toContain('hello');
    expect(html).toContain('world');
  });

  it('safely encodes quotes and newlines', () => {
    const source = 'const a = "line1\\nline2";\nconst b = \'single\';';
    const html = buildPreviewSrcdoc(source);
    // Should not break the HTML structure
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('handles empty source', () => {
    const html = buildPreviewSrcdoc('');
    expect(html).toContain('Babel.transform');
    expect(html).toContain('No App component found');
  });

  it('uses explicit Babel.transform instead of auto-transpile', () => {
    const html = buildPreviewSrcdoc('function App() { return <div/>; }');
    // Should NOT use <script type="text/babel"> auto-transpile
    expect(html).not.toContain('type="text/babel"');
    // Should use explicit Babel.transform call
    expect(html).toContain('Babel.transform');
  });

  it('loads scripts dynamically via loadScript function', () => {
    const html = buildPreviewSrcdoc('');
    expect(html).toContain('function loadScript');
    expect(html).toContain("document.createElement('script')");
  });
});
