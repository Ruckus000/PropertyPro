/// <reference types="@testing-library/jest-dom" />
/**
 * R-2 (2026-11-11 empty-state audit): the category select derived its labels
 * by capitalising the first letter of each value, which rendered `hvac` as
 * "Hvac". The acronym must read "HVAC".
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/maintenance-requests', () => ({
  createMaintenanceRequest: vi.fn(),
  requestPhotoUploadUrl: vi.fn(),
}));

import { SubmitForm } from '@/components/maintenance/SubmitForm';

describe('<SubmitForm> category labels', () => {
  it('renders the hvac category as the acronym HVAC', () => {
    render(<SubmitForm communityId={1} userId="u-1" />);
    const select = screen.getByLabelText('Category');
    const option = within(select).getByRole('option', { name: 'HVAC' });
    expect(option).toHaveValue('hvac');
    expect(within(select).queryByRole('option', { name: 'Hvac' })).toBeNull();
  });

  it('keeps the other category labels in title case', () => {
    render(<SubmitForm communityId={1} userId="u-1" />);
    const select = screen.getByLabelText('Category');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['Plumbing', 'Electrical', 'HVAC', 'General', 'Other']);
  });
});
