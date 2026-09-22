// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { SUPPORT_MAILBOX_CONTEXT } from '@propertypro/shared';
import { ThreadContextStrip } from '@/components/inbox/ThreadContextStrip';

/**
 * All three mailbox actions are live: `support` links to `/tickets/new` (the
 * Wave 3 ticket routes shipped, so the flag flipped), `privacy` links to
 * `/deletion-requests` (Task 18 taught it to seed its filter from the URL), and
 * `contact` is backed by `POST /api/admin/leads`.
 *
 * The two links' HREFs are the security-relevant part: they must carry the
 * thread id, never the participant's email. A link containing `@` puts a data
 * subject's address in Vercel access logs, browser history and Sentry navigation
 * breadcrumbs — the sink this branch removed from the command palette.
 *
 * Assertions read their accessible names from `SUPPORT_MAILBOX_CONTEXT`
 * rather than repeating the literal strings — the lookups only resolve
 * because the component renders `context.action` verbatim, so a renamed
 * label must move the test with it instead of leaving it green while it
 * silently stops covering anything.
 */
describe('ThreadContextStrip', () => {
  it('support links to the ticket queue by thread id, with no PII in the href', () => {
    render(<ThreadContextStrip mailbox="support" threadId={12} />);
    const link = screen.getByRole('link', { name: SUPPORT_MAILBOX_CONTEXT.support.action });
    const href = link.getAttribute('href') ?? '';
    expect(href).toBe('/tickets/new?thread=12');
    expect(href).not.toContain('@');
    expect(href).not.toContain('%40');
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  it('privacy links to the deletion queue by thread id, with no PII in the href', () => {
    render(<ThreadContextStrip mailbox="privacy" threadId={12} />);
    const link = screen.getByRole('link', { name: SUPPORT_MAILBOX_CONTEXT.privacy.action });
    const href = link.getAttribute('href') ?? '';
    expect(href).toBe('/deletion-requests?thread=12');
    // The assertion that matters independently of the exact route: no email
    // address, in any encoding, can reach the URL.
    expect(href).not.toContain('@');
    expect(href).not.toContain('%40');
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  it('contact offers a convert-to-lead button', () => {
    render(<ThreadContextStrip mailbox="contact" threadId={12} />);
    expect(
      screen.getByRole('button', { name: SUPPORT_MAILBOX_CONTEXT.contact.action }),
    ).toBeTruthy();
  });
});
