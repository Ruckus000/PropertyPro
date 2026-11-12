/// <reference types="@testing-library/jest-dom" />
/**
 * R-3 (2026-11-11 empty-state audit): PackageResidentView ignored `isError`,
 * so a failed load fell through to "No pending packages" — telling the
 * resident nothing had arrived when the list simply never loaded.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/request-json';

const { useMyPackagesMock, refetchMock } = vi.hoisted(() => ({
  useMyPackagesMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('@/hooks/use-packages', () => ({
  useMyPackages: useMyPackagesMock,
}));

import { PackageResidentView } from '@/components/packages/PackageResidentView';

function queryState(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('<PackageResidentView>', () => {
  it('shows an error with Try again, not the empty state, when the load fails', () => {
    useMyPackagesMock.mockReturnValue(
      queryState({ isError: true, error: new ApiRequestError('Boom', { status: 500 }) }),
    );
    render(<PackageResidentView communityId={7} />);

    expect(screen.getByText("We couldn't load your packages.")).toBeInTheDocument();
    expect(screen.queryByText(/No pending packages/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a 403 that is not the no-unit case an error', () => {
    useMyPackagesMock.mockReturnValue(
      queryState({
        isError: true,
        error: new ApiRequestError('Package logging is disabled', { status: 403, code: 'FORBIDDEN' }),
      }),
    );
    render(<PackageResidentView communityId={7} />);

    expect(screen.getByText("We couldn't load your packages.")).toBeInTheDocument();
    expect(screen.queryByText(/No pending packages/)).toBeNull();
  });

  it('shows a calm not-linked state for a resident with no unit', () => {
    useMyPackagesMock.mockReturnValue(
      queryState({
        isError: true,
        error: new ApiRequestError('No unit association', { status: 403, code: 'NO_UNIT_ASSOCIATION' }),
      }),
    );
    render(<PackageResidentView communityId={7} />);

    expect(screen.getByText("Your account isn't linked to a unit yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact management' })).toHaveAttribute(
      'href',
      '/help/contact?communityId=7',
    );
    expect(screen.queryByText(/No pending packages/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('still shows the empty state when the list loads empty', () => {
    useMyPackagesMock.mockReturnValue(queryState({ data: [] }));
    render(<PackageResidentView communityId={7} />);

    expect(screen.getByText(/No pending packages/)).toBeInTheDocument();
  });
});
