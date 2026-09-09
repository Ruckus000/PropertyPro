// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/inbox' }));
import { AdminRail } from '@/components/shell/AdminRail';

const counts = { inbox: 7, tickets: 0, health: 4, onboarding: 0, billing: 3, leads: 0, deletion: 2 };
const user = { email: 'ops@getpropertypro.com', initial: 'O' };

describe('AdminRail', () => {
  it('marks the active item and exposes counts as accessible badges', () => {
    render(<AdminRail activeId="inbox" counts={counts} pinned onPinnedChange={() => {}} user={user} />);
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.getAttribute('aria-current')).toBe('page');
    expect(inbox.textContent).toContain('7');
  });
  it('expands on hover when not pinned and collapses on leave', () => {
    const { container } = render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />);
    const nav = container.querySelector('nav[aria-label="Main navigation"]')!;
    expect(nav.className).toContain('w-[72px]');
    fireEvent.mouseEnter(container.firstChild as Element);
    expect(nav.className).toContain('w-[260px]');
    fireEvent.mouseLeave(container.firstChild as Element);
    expect(nav.className).toContain('w-[72px]');
  });
  it('pin button toggles and is announced', () => {
    const onPinnedChange = vi.fn();
    render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={onPinnedChange} user={user} />);
    const pin = screen.getByRole('button', { name: /keep navigation open/i });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(onPinnedChange).toHaveBeenCalledWith(true);
  });
});
