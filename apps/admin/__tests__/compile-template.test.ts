import { describe, it, expect } from 'vitest';
import { compileJsxToHtml, compileDemoTemplate } from '../src/lib/site-template/compile-template';

describe('compileJsxToHtml', () => {
  it('compiles simple JSX to HTML', async () => {
    const jsx = `function App() { return React.createElement('div', null, 'Hello'); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).toContain('Hello');
    expect(html).toContain('<div');
  });

  it('strips script tags from output', async () => {
    const jsx = `function App() { return React.createElement('div', {dangerouslySetInnerHTML: {__html: '<script>alert(1)</script>Hello'}}); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).not.toContain('<script');
    expect(html).toContain('Hello');
  });

  it('allows style tags', async () => {
    const jsx = `function App() { return React.createElement('div', {dangerouslySetInnerHTML: {__html: '<style>.foo{color:red}</style><p>styled</p>'}}); }`;
    const html = await compileJsxToHtml(jsx);
    expect(html).toContain('<style');
  });

  it('throws on invalid JSX', async () => {
    await expect(compileJsxToHtml('not valid {')).rejects.toThrow();
  });
});

describe('compileDemoTemplate', () => {
  it('compiles a registered template by ID', async () => {
    const html = await compileDemoTemplate({
      templateId: 'condo-public-civic-glass',
      communityName: 'Test Towers',
    });
    expect(html).toContain('Test Towers');
    expect(html.length).toBeGreaterThan(100);
  });

  it('throws for unknown template ID', async () => {
    await expect(
      compileDemoTemplate({ templateId: 'fake', communityName: 'X' }),
    ).rejects.toThrow();
  });
});
