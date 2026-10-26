import type { MouseEvent } from 'react';

/**
 * Keeps the public site's links from navigating the EDITOR.
 *
 * The canvas and the preview render the public page's real markup — header,
 * page nav, "Resident Login", footer, and whatever links the blocks carry —
 * inside the editor tab. Those hrefs are the public site's (`/about`,
 * `/auth/login`), which on the PM portal's origin lead somewhere else entirely,
 * and a PM clicking a nav link to "see what it looks like" would lose their
 * place. Attached with `onClickCapture` on the frame so it runs before any
 * block-level handler; the editor's own controls are buttons, never anchors,
 * so nothing of the editor's is affected. Links stay in the tab order and keep
 * their `href` for the preview to be an honest rendering.
 */
export function preventLinkNavigation(event: MouseEvent<HTMLElement>): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('a[href]')) event.preventDefault();
}
