/**
 * axe audit of the amenity list and the add/edit form (plan B1, B2).
 *
 * Each case first asserts the thing it audits rendered; each probe plants one
 * unnamed button inside that subtree and shows axe reports it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useSaveAmenity: () => ({ mutateAsync: vi.fn(), isPending: false }) };
});

// Radix Switch and Dialog need these in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { AmenityList } from '@/components/operations/AmenityList';
import { AmenityFormSheet } from '@/components/operations/AmenityFormSheet';

const POOL = {
  id: 9,
  name: 'Pool',
  description: 'Heated, with a shallow end',
  location: 'Building A',
  capacity: 40,
  isBookable: true,
  bookingRules: { maxDurationMinutes: 120, blackoutDates: ['2026-12-25'] },
};
const SAUNA = { ...POOL, id: 10, name: 'Sauna', isBookable: false, bookingRules: {} };

const ruleIds = async (el: Element) => (await axe(el)).violations.map((v) => v.id);

describe('amenities — axe', () => {
  it('the manager list has no violations', async () => {
    const { container } = render(
      <AmenityList amenities={[POOL, SAUNA]} isAdmin onEdit={() => {}} onReserve={() => {}} />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Pool' })).toBeTruthy();
    // The name is the edit control (owner decision 2026-11-24).
    expect(screen.getByRole('button', { name: 'Edit Sauna' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: list — an unnamed button in a row is caught', async () => {
    const { container } = render(
      <AmenityList amenities={[POOL]} isAdmin onEdit={() => {}} onReserve={() => {}} />,
    );
    screen.getByRole('heading', { level: 3, name: 'Pool' }).closest('li')!.appendChild(document.createElement('button'));
    expect(await ruleIds(container)).toContain('button-name');
  });

  it('the edit form has no violations', async () => {
    render(<AmenityFormSheet open onClose={() => {}} communityId={42} amenity={POOL} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit Pool' });
    expect(screen.getByLabelText('Name *')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove December 25, 2026' })).toBeTruthy();
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('probe: form — an unnamed button in the limits is caught', async () => {
    render(<AmenityFormSheet open onClose={() => {}} communityId={42} amenity={POOL} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit Pool' });
    screen.getByRole('group', { name: 'Booking limits' }).appendChild(document.createElement('button'));
    expect(await ruleIds(dialog)).toContain('button-name');
  });
});
