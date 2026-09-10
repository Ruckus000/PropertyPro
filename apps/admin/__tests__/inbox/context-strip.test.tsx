// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { ThreadContextStrip } from '@/components/inbox/ThreadContextStrip';

/**
 * Deviates from the brief (task-16-dispatch-notes.md #2): the strip's
 * "Create ticket" and "Open deletion request" actions point at destinations
 * that don't exist on this branch — `/tickets/new` ships in Task 22, the
 * `/deletion-requests?q=` reader ships in Task 18 — so this task renders them
 * as inert copy instead of a link that 404s or silently does nothing. Only
 * `contact` (backed by `POST /api/admin/leads`, shipped in this same task) is
 * a live action.
 */
describe('ThreadContextStrip', () => {
  it('support has no live action yet — /tickets/new ships in Wave 3 (Task 22)', () => {
    render(<ThreadContextStrip mailbox="support" threadId={12} participantEmail="a@b.c" />);
    expect(screen.queryByRole('link', { name: 'Create ticket' })).toBeNull();
    expect(screen.getByText(/not available yet/i)).toBeTruthy();
  });

  it('privacy has no live action yet — the deletion-requests ?q= reader ships in Task 18', () => {
    render(<ThreadContextStrip mailbox="privacy" threadId={12} participantEmail="k@gmail.com" />);
    expect(screen.queryByRole('link', { name: 'Open deletion request' })).toBeNull();
    expect(screen.getByText(/not available yet/i)).toBeTruthy();
  });

  it('contact offers a convert-to-lead button', () => {
    render(<ThreadContextStrip mailbox="contact" threadId={12} participantEmail="m@x.com" />);
    expect(screen.getByRole('button', { name: 'Convert to lead' })).toBeTruthy();
  });
});
