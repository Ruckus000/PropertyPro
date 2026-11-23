import React, { type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveFeatures } from '@propertypro/shared';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

/**
 * The collapsed desktop rail opens while a mouse pointer is over it and closes
 * when the pointer leaves. It opens as an overlay: the wrapper keeps the
 * collapsed width in the layout, so the page does not shift.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/layout/community-picker-dialog', () => ({
  CommunityPickerDialog: () => null,
}));

const NAV_EXPANDED_KEY = 'propertypro.nav-expanded';

function renderSidebar(props: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}>
      <SidebarProvider>{node}</SidebarProvider>
    </QueryClientProvider>
  );
  return render(
    wrap(
      <AppSidebar
        communityId={7}
        communityName="Sunset Condos"
        communityType="condo_718"
        role="property_manager"
        features={getEffectiveFeatures('condo_718', 'professional')}
        userName="Test Ruckus"
        plan="professional"
        hoverPeek
        {...props}
      />,
    ),
  );
}

const rail = () => screen.getByRole('navigation', { name: 'Main navigation' });
/** The element that carries the pointer handlers: the outermost wrapper. */
const wrapper = (container: HTMLElement) => container.firstElementChild as HTMLElement;
const isOpen = () => rail().className.includes('w-[16.25rem]');

async function renderCollapsed(props: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  window.localStorage.setItem(NAV_EXPANDED_KEY, 'false');
  const view = renderSidebar(props);
  // The stored state is read in an effect, after the first paint.
  await act(async () => {});
  expect(isOpen()).toBe(false);
  return view;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AppSidebar — hover opens the collapsed rail', () => {
  it('opens while a mouse pointer is over it and closes when the pointer leaves', async () => {
    const { container } = await renderCollapsed();

    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });
    expect(isOpen()).toBe(true);

    fireEvent.pointerMove(document.body);
    expect(isOpen()).toBe(false);
  });

  it('stays open while the pointer is in a popover or dialog the rail opened', async () => {
    const { container } = await renderCollapsed();
    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });

    // Radix renders these in a portal on <body>, outside the rail's wrapper.
    const portal = document.createElement('div');
    portal.setAttribute('data-radix-popper-content-wrapper', '');
    portal.innerHTML = '<button type="button">Palm Shores HOA</button>';
    document.body.appendChild(portal);
    try {
      fireEvent.pointerMove(portal.querySelector('button')!);
      expect(isOpen()).toBe(true);
    } finally {
      portal.remove();
    }

    fireEvent.pointerMove(document.body);
    expect(isOpen()).toBe(false);
  });

  it('opens as an overlay: the wrapper keeps the collapsed width so the page does not shift', async () => {
    const { container } = await renderCollapsed();

    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });

    expect(wrapper(container).className).toContain('w-[4.5rem]');
    expect(rail().parentElement!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'z-40']),
    );
  });

  it('does not open for a touch pointer, which has no hover to leave', async () => {
    const { container } = await renderCollapsed();

    fireEvent.pointerEnter(wrapper(container), { pointerType: 'touch' });

    expect(isOpen()).toBe(false);
  });

  it('labels the toggle "Keep sidebar open" while peeking, and it keeps the rail open', async () => {
    const { container } = await renderCollapsed();
    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });

    fireEvent.click(screen.getByRole('button', { name: 'Keep sidebar open' }));
    fireEvent.pointerMove(document.body);

    expect(isOpen()).toBe(true);
    expect(window.localStorage.getItem(NAV_EXPANDED_KEY)).toBe('true');
    // Kept open, it is back in the layout, not floating over the page.
    expect(rail().parentElement!.className).not.toContain('absolute');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeDefined();
  });

  it('does nothing without hoverPeek (the phone drawer)', async () => {
    const { container } = await renderCollapsed({ hoverPeek: false });

    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });

    expect(isOpen()).toBe(false);
  });

  it('leaves an expanded rail in the layout when hovered', async () => {
    const { container } = renderSidebar();
    await act(async () => {});
    expect(isOpen()).toBe(true);

    fireEvent.pointerEnter(wrapper(container), { pointerType: 'mouse' });

    expect(rail().parentElement!.className).not.toContain('absolute');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeDefined();
  });
});
