// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
import { NotificationTray } from '@/components/shell/NotificationTray';

const items = [
  {
    id: 'a',
    tone: 'info' as const,
    icon: 'inbox' as const,
    title: 'New reply from Denise',
    meta: 'support@',
    href: '/inbox/1',
    occurredAt: '2026-09-08T09:14:00Z',
  },
];

// The two event types the tray's open/close effect attaches to `document`.
// Used to isolate this component's listeners from anything else jsdom/RTL
// registers (React itself, other test-global listeners, …) so the leak
// assertion below can't be thrown off by unrelated activity.
const isTrayListener = (call: unknown[]) => call[0] === 'pointerdown' || call[0] === 'keydown';

describe('NotificationTray — Escape and outside-click close paths', () => {
  it('closes on Escape while open', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on a pointerdown outside the panel', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close on a pointerdown on the trigger', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );

    const trigger = screen.getByRole('button', { name: /notifications, 1 unread/i });
    fireEvent.pointerDown(trigger);

    // The click handler that TOGGLES the tray lives separately on the
    // trigger's onClick — a bare pointerdown (no click) must not itself
    // close it via the outside-click path, which is exactly what the
    // trigger-containment check in the effect exists to prevent (otherwise
    // the click that opened the tray would immediately close it again).
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not close on a pointerdown on the panel', () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );

    const panel = screen.getByRole('region', { name: 'Notifications' });
    fireEvent.pointerDown(panel);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('balances document listener add/remove across open, close, and unmount (no leak)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const onOpenChange = vi.fn();

    const { rerender, unmount } = render(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );

    // Sanity: opening actually attached the tray's listeners. Asserting a
    // real positive count (not just "no leak") rules out a vacuous pass from
    // a handler that never attaches anything in the first place.
    const addedOnOpen = addSpy.mock.calls.filter(isTrayListener).length;
    expect(addedOnOpen).toBeGreaterThan(0);

    // Close via a prop change (not a click) — the effect's cleanup, not a
    // click handler, is what must run.
    rerender(
      <NotificationTray items={items} unread={1} open={false} onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );
    expect(removeSpy.mock.calls.filter(isTrayListener).length).toBe(addedOnOpen);

    // Reopen, then unmount WITHOUT closing first — React still must run the
    // effect's cleanup on unmount, so the balance must hold here too.
    rerender(
      <NotificationTray items={items} unread={1} open onOpenChange={onOpenChange} onMarkAllRead={() => {}} />,
    );
    const addedTotal = addSpy.mock.calls.filter(isTrayListener).length;
    unmount();
    expect(removeSpy.mock.calls.filter(isTrayListener).length).toBe(addedTotal);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('NotificationTray — empty state', () => {
  it('renders the empty state when items is empty', () => {
    render(<NotificationTray items={[]} unread={0} open onOpenChange={() => {}} onMarkAllRead={() => {}} />);

    expect(screen.getByText(/all caught up/i)).toBeTruthy();
    expect(screen.getByText(/no notifications right now/i)).toBeTruthy();
  });
});
