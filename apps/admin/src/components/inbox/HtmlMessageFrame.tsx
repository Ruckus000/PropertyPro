'use client';

/**
 * The sandbox for rendering a received email's HTML.
 *
 * DELIBERATELY THE EMPTY STRING, and deliberately NOT
 * `PREVIEW_IFRAME_SANDBOX` from `@propertypro/ui`. That constant is
 * `'allow-same-origin allow-scripts allow-forms allow-top-navigation-by-user-activation'`,
 * which is correct for previewing OUR OWN pages — and catastrophic here.
 * `allow-same-origin` plus `allow-scripts` on a same-origin document is not a
 * sandbox at all: script inside the frame can reach `parent.document` and
 * simply remove the sandbox attribute.
 *
 * An email body has no legitimate reason to execute anything, submit anything,
 * or navigate anywhere. `sandbox=""` denies all of it, which is the correct
 * default for markup written by an anonymous party on the public internet and
 * rendered inside a `super_admin` session.
 *
 * One consequence, recorded because it looks like a bug: the frame CANNOT
 * grow to fit its content. `sandbox=""` puts the document in an opaque
 * origin, so `contentDocument` is null from here and there is nothing to
 * measure. A grow-to-fit effect lived here for a while and returned at its
 * own null guard on every render, forever. A long message scrolls inside a
 * fixed frame; that is the price of the sandbox, and the sandbox wins.
 *
 * This is the SECOND layer. The HTML has already been through
 * `sanitizeInboundHtml` server-side, and the console shows plain text by
 * default. Either layer failing alone should not be enough.
 */
const INBOUND_HTML_SANDBOX = '';

interface HtmlMessageFrameProps {
  /** Already server-sanitized. Never pass a raw `html_body` here. */
  sanitizedHtml: string;
}

export function HtmlMessageFrame({ sanitizedHtml }: HtmlMessageFrameProps) {
  return (
    <iframe
      // The empty string is the whole point — see INBOUND_HTML_SANDBOX above.
      sandbox={INBOUND_HTML_SANDBOX}
      srcDoc={sanitizedHtml}
      title="Original message"
      className="w-full rounded-md border border-edge bg-surface-card"
      style={{ height: 240 }}
    />
  );
}
