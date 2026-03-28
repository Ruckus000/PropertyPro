import { describe, it, expect } from 'vitest';
import { compileJsxToHtmlDetailed } from '../../src/lib/site-template/compile-template';

describe('compileJsxToHtmlDetailed', () => {
  it('returns html for valid JSX with App component', async () => {
    const result = await compileJsxToHtmlDetailed(
      'function App() { return React.createElement("div", null, "Hello World"); }',
    );
    expect(result.html).toContain('Hello World');
    expect(result.errors).toBeUndefined();
  });

  it('injects PP_TEMPLATE context into the compiled code', async () => {
    const result = await compileJsxToHtmlDetailed(
      'function App() { return React.createElement("h1", null, PP_TEMPLATE.communityName); }',
      { templateContext: { communityName: 'Test Community' } },
    );
    expect(result.html).toContain('Test Community');
  });

  it('returns compile-stage error for invalid syntax', async () => {
    const result = await compileJsxToHtmlDetailed('function App() { return <div; }');
    expect(result.html).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0].stage).toBe('compile');
  });

  it('returns runtime error when no App component is defined', async () => {
    const result = await compileJsxToHtmlDetailed('const x = 42;');
    expect(result.html).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors![0].stage).toBe('runtime');
  });

  it('returns runtime error when App throws', async () => {
    const result = await compileJsxToHtmlDetailed(
      'function App() { throw new Error("boom"); }',
    );
    expect(result.html).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors![0].stage).toBe('runtime');
    expect(result.errors![0].message).toContain('boom');
  });

  it('sanitizes script tags from output HTML', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() { return React.createElement("div", {dangerouslySetInnerHTML: {__html: '<script>alert(1)<\\/script>Safe'}}); }`,
    );
    expect(result.html).not.toContain('<script');
    expect(result.html).toContain('Safe');
  });

  it('allows style tags in output', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() { return React.createElement("div", {dangerouslySetInnerHTML: {__html: '<style>.x{color:red}<\\/style><p>ok<\\/p>'}}); }`,
    );
    expect(result.html).toContain('<style');
  });
});
