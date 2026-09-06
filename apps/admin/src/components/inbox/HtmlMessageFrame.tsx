'use client';

import { useEffect, useRef, useState } from 'react';

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  // Grow to fit rather than scrolling a nested pane, which is miserable to read.
  // Capped, because a hostile message should not be able to make the console
  // page arbitrarily long.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const document_ = frame.contentDocument;
    if (!document_) return;
    const measured = document_.body?.scrollHeight ?? 0;
    if (measured > 0) setHeight(Math.min(Math.max(measured + 24, 120), 2000));
  }, [sanitizedHtml]);

  return (
    <iframe
      ref={frameRef}
      // The empty string is the whole point — see INBOUND_HTML_SANDBOX above.
      sandbox={INBOUND_HTML_SANDBOX}
      srcDoc={sanitizedHtml}
      title="Original message"
      className="w-full rounded-md border border-edge bg-surface-card"
      style={{ height }}
    />
  );
}
