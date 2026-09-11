// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
import { AdminTopBar } from '@/components/shell/AdminTopBar';

const signals = { counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 }, items: [
  { key: 'inbox' as const,
      id: 'a', tone: 'info' as const, icon: 'inbox' as const, title: 'New reply from Denise', meta: 'support@', href: '/inbox/1', occurredAt: '2026-09-08T09:14:00Z' },
], critical: null, generatedAt: 'x', failed: [] };

describe('AdminTopBar', () => {
  it('opens the tray with an accessible count and marks all read', () => {
    const onMarkAllRead = vi.fn();
    render(<AdminTopBar mobile={false} title="Inbox" showBack={false} onBack={() => {}} onOpenDrawer={() => {}} onOpenSearch={() => {}} signals={signals} readAt={null} onMarkAllRead={onMarkAllRead} />);
    const bell = screen.getByRole('button', { name: /notifications, 1 unread/i });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bell);
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /new reply from denise/i }).getAttribute('href')).toBe('/inbox/1');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
  it('shows the menu and back buttons on mobile', () => {
    const onBack = vi.fn();
    render(<AdminTopBar mobile title="Thread" showBack onBack={onBack} onOpenDrawer={() => {}} onOpenSearch={() => {}} signals={signals} readAt="2026-09-09T00:00:00Z" onMarkAllRead={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });
});
