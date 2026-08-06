import { describe, expect, it } from 'vitest';
import {
  compileDemoTemplate,
  escapeForJsStringLiteral,
} from '@/lib/site-template/compile-template';

/**
 * P1-6: the demo-template compiler evaluates generated source with
 * `new Function()` and no sandbox. Every template interpolates context values
 * straight into single-quoted JS string literals —
 * `fontFamily: '${fontBody}'`, `React.createElement('h1', ..., '${communityName}')`
 * — so a lone apostrophe in any of them closes the literal early and the rest
 * of the value is executed as code, in the admin process, which holds the
 * service-role key.
 *
 * The route schemas allowlist colors and fonts, but `communityName` /
 * `prospectName` are free text by definition. Escaping at the compile boundary
 * is therefore the control that actually closes this, and these tests exercise
 * the REAL compiler rather than asserting on the escape function alone.
 */

const TEMPLATE_ID = 'condo-public-coastal-welcome';

const SAFE_BRANDING = {
  primaryColor: '#0D4F6E',
  secondaryColor: '#0891B2',
  accentColor: '#CFFAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
};

describe('escapeForJsStringLiteral', () => {
  it('escapes the single quote that breaks out of the literal', () => {
    expect(escapeForJsStringLiteral("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes before quotes, so \\\\\' cannot re-open', () => {
    // Naive quote-only escaping turns  \'  into  \\'  — a literal backslash
    // followed by an unescaped quote. Backslash must be handled first.
    expect(escapeForJsStringLiteral("a\\'b")).toBe("a\\\\\\'b");
  });

  it('escapes newlines, which also terminate a JS string literal', () => {
    expect(escapeForJsStringLiteral('a\nb')).toBe('a\\nb');
  });

  it('neutralises template-literal interpolation', () => {
    // Escaping the `$` is enough — `\${` cannot start an interpolation, so the
    // brace needs no separate treatment.
    expect(escapeForJsStringLiteral('${process}')).toBe('\\${process}');
  });

  it('escapes angle brackets so a value cannot close a tag', () => {
    expect(escapeForJsStringLiteral('</script>')).toBe('\\u003C/script\\u003E');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeForJsStringLiteral('Sunset Condos')).toBe('Sunset Condos');
  });
});

describe('compileDemoTemplate injection resistance', () => {
  it('compiles a benign community name', async () => {
    const html = await compileDemoTemplate({
      templateId: TEMPLATE_ID,
      communityName: 'Sunset Condos',
      branding: SAFE_BRANDING,
    });

    expect(html).toContain('Sunset Condos');
  });

  it('survives an apostrophe in the community name', async () => {
    // The realistic case that is ALSO the attack primitive.
    const html = await compileDemoTemplate({
      templateId: TEMPLATE_ID,
      communityName: "O'Malley Court",
      branding: SAFE_BRANDING,
    });

    expect(html).toContain('Malley');
  });

  it('does not execute injected code in the community name', async () => {
    // Before escaping, this closed the string literal and ran the assignment
    // inside the admin process. It must now be inert text.
    // Deliberately valid JavaScript in EVERY position a template puts a
    // string literal (object-property value, createElement argument):
    // `'' + (assignment) + ''` parses and RUNS anywhere. A payload that merely
    // causes a syntax error would make this test pass for the wrong reason —
    // it would prove the compiler rejected the input, not that the value was
    // treated as data.
    const payload = "' + (globalThis.__PP_TEMPLATE_PWNED = true) + '";

    const html = await compileDemoTemplate({
      templateId: TEMPLATE_ID,
      communityName: payload,
      branding: SAFE_BRANDING,
    });

    expect((globalThis as Record<string, unknown>).__PP_TEMPLATE_PWNED).toBeUndefined();
    expect(html).toBeTruthy();
  });

  it('does not execute injected code smuggled through a branding field', async () => {
    // Branding is allowlisted at the route layer, but compileDemoTemplate is
    // also reachable from other call sites — it must not depend on its callers
    // having validated.
    const html = await compileDemoTemplate({
      templateId: TEMPLATE_ID,
      communityName: 'Test Community',
      branding: {
        ...SAFE_BRANDING,
        primaryColor: "#fff' + (globalThis.__PP_BRANDING_PWNED = true) + '",
      },
    });

    expect((globalThis as Record<string, unknown>).__PP_BRANDING_PWNED).toBeUndefined();
    expect(html).toBeTruthy();
  });
});
