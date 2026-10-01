/**
 * The residents list names a resident's unit by its number ("Unit 1B"), not by
 * its database id. GET /api/v1/residents attaches `unitLabel` (withUnitLabels).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResidentList } from '@/components/residents/resident-list';

describe('ResidentList unit label', () => {
  it('shows the unit number, not the id', () => {
    render(
      <ResidentList
        residents={[
          { userId: 'u1', fullName: 'Tyler Tenant', email: 't@example.com', role: 'resident', unitId: 2, unitLabel: 'Unit 1B' },
          { userId: 'u2', fullName: 'Cameron CAM', email: 'c@example.com', role: 'property_manager', unitId: null, unitLabel: null },
        ]}
        query=""
        onQueryChange={vi.fn()}
        onResendInvite={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText(/Unit 1B/)).toBeTruthy();
    expect(screen.queryByText(/Unit 2\b/)).toBeNull();
  });
});
