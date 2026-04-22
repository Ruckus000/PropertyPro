import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitsPageClient } from '../../../src/components/units/units-page-client';

const { useUnitsMock, useCreateUnitMock } = vi.hoisted(() => ({
  useUnitsMock: vi.fn(),
  useCreateUnitMock: vi.fn(),
}));

vi.mock('@/hooks/use-units', () => ({
  useUnits: useUnitsMock,
  useCreateUnit: useCreateUnitMock,
}));

describe('UnitsPageClient — canWrite gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUnitsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: [
        {
          id: 1,
          communityId: 42,
          unitNumber: '101',
          building: null,
          floor: null,
          bedrooms: null,
          bathrooms: null,
          sqft: null,
          rentAmount: null,
          ownerUserId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });
    useCreateUnitMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    });
  });

  it('renders Add unit button when canWrite is true', () => {
    render(
      <UnitsPageClient communityId={42} communityType="condo_718" canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: /add unit/i })).toBeInTheDocument();
  });

  it('hides Add unit button when canWrite is false', () => {
    render(
      <UnitsPageClient communityId={42} communityType="condo_718" canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
  });

  it('hides Add unit action on empty state when canWrite is false', () => {
    useUnitsMock.mockReturnValue({ isLoading: false, error: null, data: [] });
    render(
      <UnitsPageClient communityId={42} communityType="condo_718" canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
  });
});
