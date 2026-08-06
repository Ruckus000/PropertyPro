/**
 * The demo-template compiler evaluates template source. It used to do so with
 * `new Function()`, which runs in the admin process's own realm — reaching
 * `process.env` (and therefore SUPABASE_SERVICE_ROLE_KEY) needed only a
 * `constructor` chain, and an infinite loop could not be interrupted at all.
 *
 * It now runs in a fresh V8 context with a timeout. These tests pin both
 * properties, plus the thing that would make the change worthless: that every
 * real template still renders.
 */
import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from '@propertypro/shared';
import { compileDemoTemplate, compileJsxToHtmlDetailed } from '@/lib/site-template/compile-template';

describe('template evaluation sandbox', () => {
  // The regression that matters most: a sandbox that breaks the product is not
  // a fix. Cross-realm React elements still render because the brand check is
  // `Symbol.for('react.element')`, which is realm-independent — but that is a
  // claim worth testing rather than asserting.
  it.each(ALL_TEMPLATES.map((t) => [t.id] as const))(
    'still renders template %s end to end',
    async (id) => {
      const html = await compileDemoTemplate({
        templateId: id,
        communityName: 'Sunset Condos',
      });

      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    },
  );

  // Lexical scoping is what makes this hold at RENDER time too: React invokes
  // App from the host realm, but App's scope chain is still the sandbox's.
  it('cannot reach process from inside a template', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() { return React.createElement('div', null, String(typeof process)); }`,
    );

    expect(result.errors).toBeUndefined();
    // 'undefined', not 'object' — the sandbox object is the entire global scope.
    expect(result.html).toContain('undefined');
  });

  it('cannot reach require or globalThis-inherited Node builtins', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() {
         return React.createElement('div', null, [typeof require, typeof module, typeof Buffer].join(','));
       }`,
    );

    expect(result.errors).toBeUndefined();
    expect(result.html).toContain('undefined,undefined,undefined');
  });

  // `new Function` could not be interrupted at all. The timeout bounds the
  // runInNewContext call, i.e. MODULE-LEVEL code.
  //
  // It does NOT bound the component body: that runs later, inside
  // renderToStaticMarkup, in the host realm's time budget. A `while(true){}`
  // inside App() still wedges the request — measured, and documented on
  // runTemplateFactory. Do not "fix" this test by moving the loop into App;
  // it will hang the suite, which is exactly the point.
  it('aborts a runaway at module level instead of hanging', async () => {
    const result = await compileJsxToHtmlDetailed(
      `while (true) {}\nfunction App() { return null; }`,
    );

    expect(result.errors?.[0]?.stage).toBe('runtime');
    expect(result.errors?.[0]?.message).toMatch(/timed out|Script execution/i);
  }, 15_000);

  // Documents a KNOWN limitation rather than a property we rely on. React is a
  // host-realm object, so its function constructor reaches the host realm. This
  // test exists so nobody reads the vm context as containment; if a future
  // change makes it fail (a worker, a frozen React shim), that is an
  // improvement — update the test, do not delete the constraint it records.
  it('is NOT a containment boundary: a host function reference still escapes', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() {
         var reached;
         try { reached = typeof React.createElement.constructor('return process')(); }
         catch (e) { reached = 'blocked'; }
         return React.createElement('div', null, reached);
       }`,
    );

    expect(result.errors).toBeUndefined();
    expect(result.html).toContain('object');
  });

  it('reports a template runtime error as a diagnostic, not a crash', async () => {
    const result = await compileJsxToHtmlDetailed(
      `function App() { throw new Error('template blew up'); }`,
    );

    expect(result.errors?.[0]?.stage).toBe('runtime');
    expect(result.errors?.[0]?.message).toContain('template blew up');
  });
});
