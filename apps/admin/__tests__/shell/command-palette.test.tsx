// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// cmdk's Command.List measures itself with a ResizeObserver, which jsdom does
// not implement. Same shim apps/web already uses for Radix components in jsdom
// (see apps/web/__tests__/access-requests/request-access-form.test.tsx).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// cmdk also scrolls the selected item into view on every render, which jsdom
// (no real layout) does not implement either.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { AdminCommandPalette } from '@/components/shell/AdminCommandPalette';

describe('AdminCommandPalette', () => {
  it('lists pages immediately and merges server hits after typing', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ key: 'clients', label: 'Clients', hits: [{ id: '1', label: 'Sunset Condos', meta: 'Condo §718', href: '/clients/1', icon: 'building' }] }] }))) as any;
    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByRole('option', { name: /deletion requests/i })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sun' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /sunset condos/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /sunset condos/i }));
    expect(push).toHaveBeenCalledWith('/clients/1');
  });
});
