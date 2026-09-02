/**
 * Focus rings in the shadcn layer must be KEYBOARD-ONLY.
 *
 * These controls used a bare `focus:` variant while the rest of the design
 * system (button.tsx, and dialog.tsx's own resize handles) uses `focus-visible:`.
 * A bare `focus:` ring paints on programmatic and mouse focus too — when a Dialog
 * opens, Radix autofocuses the first focusable element, so with disabled footer
 * controls focus fell through to the close button and it painted a ring on a
 * purely mouse-driven open.
 *
 * `.claude/rules/design.md` forbids ever suppressing focus-visible, so the
 * keyboard ring must survive: each control is asserted to still declare a ring
 * WIDTH and COLOR, not merely to have lost `focus:ring-*`. Asserting only
 * `focus-visible:ring-` was too weak — `focus-visible:ring-focus` alone sets
 * `--tw-ring-color` while `--tw-ring-shadow` keeps its `0 0 #0000` default, so
 * nothing paints and the test would still pass.
 *
 * Repo-wide enforcement lives in the `bare-focus-ring` rule of
 * `scripts/verify-design-tokens.ts` (`pnpm guard:design-tokens`), which covers
 * every file under apps/web/src and apps/admin/src — including consumer overrides like
 * `<SelectTrigger className="focus:ring-2">`, which tailwind-merge would layer
 * ON TOP of the base ring rather than replacing it. This file pins the three
 * shadcn primitives' own declarations plus one page-level button.
 *
 * VERIFICATION (JSDOM implements neither `:focus-visible` nor Tailwind, so this
 * file guards the CLASS CONTRACT only):
 *  - Rendered behaviour was measured in Chrome against CSS compiled from the
 *    real `apps/web/tailwind.config.ts`. Mouse click on the close button:
 *    `boxShadow: none`. Tab to it: `focusVisible: true`, box-shadow
 *    `rgb(226,114,91) 0 0 0 4px` over a 2px offset. A control button carrying
 *    the OLD `focus:` classes painted the ring on the mouse click — i.e. the
 *    bug reproduces, so the "no ring" result is not vacuous.
 *  - Revert-checks, each reddening exactly one test while the others stay green:
 *    restoring `focus:` on the close button at dialog.tsx:275 fails "ring
 *    width"; stripping `focus-visible:ring-2` from select.tsx to leave only
 *    `ring-focus` also fails "ring width" (the color-without-width case);
 *    restoring `focus-visible:ring-focus/20` on the submit button below fails
 *    "ring color".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

// The form only needs its server action stubbed; rendering never invokes it.
vi.mock('@/lib/auth/actions', () => ({ requestPasswordReset: vi.fn() }));

/**
 * Bare `focus:` — the colon is what distinguishes it from `focus-visible:`.
 * The leading `(?:[\w-]+:)*` matters: anchoring on whitespace alone let
 * variant-prefixed reintroductions (`md:focus:ring-2`, `dark:focus:ring-2`,
 * `hover:focus:outline-none`) through. The trailing `(?:-|(?![\w-]))` matters
 * too: Tailwind's BARE `ring` and `shadow` utilities have no hyphen, and
 * `focus:ring` is a real 3px `:focus`-gated ring. `shadow` is here because a
 * box-shadow is the other way to draw a ring.
 */
const BARE_FOCUS_RING = /(?:^|\s)(?:[\w-]+:)*focus:(?:ring|outline|shadow)(?:-|(?![\w-]))/;
/** A ring WIDTH utility (`ring`, `ring-1|2|4|8`) — not `ring-<color>`, not `ring-offset-*`. */
const FOCUS_VISIBLE_RING_WIDTH = /(?:^|\s)focus-visible:ring(?:-(?:1|2|4|8))?(?=\s|$)/;
/** The semantic ring color. Without it the ring paints in Tailwind's default gray. */
const FOCUS_VISIBLE_RING_COLOR = /(?:^|\s)focus-visible:ring-focus(?=\s|$)/;

afterEach(() => {
  cleanup();
  // The `vi.mock` factory runs once per module, so the spy's call history would
  // otherwise persist across tests and make any future call-count assertion
  // depend on test order.
  vi.clearAllMocks();
});

function expectKeyboardOnlyRing(el: HTMLElement, label: string) {
  const cls = el.getAttribute('class') ?? '';
  expect(cls, `${label} should declare a focus-visible ring width`).toMatch(
    FOCUS_VISIBLE_RING_WIDTH,
  );
  expect(cls, `${label} should declare the focus-visible ring color`).toMatch(
    FOCUS_VISIBLE_RING_COLOR,
  );
  expect(cls, `${label} must not use a bare focus: ring/outline/shadow`).not.toMatch(
    BARE_FOCUS_RING,
  );
}

describe('shadcn focus rings are keyboard-only', () => {
  it('DialogContent close button uses focus-visible, not focus', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expectKeyboardOnlyRing(screen.getByRole('button', { name: 'Close' }), 'Dialog close');
  });

  it('SheetContent close button uses focus-visible, not focus', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expectKeyboardOnlyRing(screen.getByRole('button', { name: 'Close' }), 'Sheet close');
  });

  it('SelectTrigger uses focus-visible, not focus', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Pick one">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>,
    );
    expectKeyboardOnlyRing(screen.getByRole('combobox'), 'SelectTrigger');
  });
});

/**
 * Page-level buttons outside the shadcn layer had the same bare-`focus:` ring.
 * They are pinned repo-wide by the `bare-focus-ring` guard rule, which reads
 * source text; this case additionally proves the class survives to the rendered
 * DOM. ForgotPasswordForm is the cheapest real submit button to mount.
 *
 * It also guards a second defect these buttons shipped: the ring COLOR was
 * written `focus-visible:ring-focus/20`. Slash-opacity on a bare-var token
 * emits ZERO css (verified against the real tailwind.config.ts), so the ring
 * fell back to Tailwind's default color instead of coral — the ring survived
 * but in the wrong color. FOCUS_VISIBLE_RING_COLOR requires the bare token.
 */
describe('page-level buttons use keyboard-only focus rings', () => {
  it('ForgotPasswordForm submit button uses focus-visible with the token color', () => {
    render(<ForgotPasswordForm />);
    expectKeyboardOnlyRing(
      screen.getByRole('button', { name: 'Send reset link' }),
      'ForgotPasswordForm submit',
    );
  });
});
