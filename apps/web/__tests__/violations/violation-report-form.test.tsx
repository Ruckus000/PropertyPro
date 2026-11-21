/**
 * The resident report form (D1): the resident picks the unit the report is
 * about — any unit in the community, usually a neighbour's — and common-area
 * problems are pointed at a maintenance request.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViolationReportForm } from '../../src/components/violations/ViolationReportForm';

const { createViolationMock, refreshMock, useUnitsMock } = vi.hoisted(() => ({
  createViolationMock: vi.fn(),
  refreshMock: vi.fn(),
  useUnitsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('@/hooks/use-units', () => ({ useUnits: useUnitsMock }));
vi.mock('@/lib/api/violations', () => ({ createViolation: createViolationMock }));
vi.mock('@/lib/violations/evidence-upload', () => ({ uploadEvidencePhoto: vi.fn() }));

function unit(id: number, unitNumber: string) {
  return { id, communityId: 42, unitNumber, building: null };
}

describe('ViolationReportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUnitsMock.mockReturnValue({
      data: [unit(1, '1A'), unit(2, '1B')],
      error: null,
      isLoading: false,
    });
    createViolationMock.mockResolvedValue({ id: 9 });
  });

  it('lists every unit and marks the reporter’s own', () => {
    render(<ViolationReportForm communityId={42} ownUnitIds={[1]} />);

    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Unit 1A (your unit)');
    expect(options).toContain('Unit 1B');
  });

  it('files against the unit the resident picked — a neighbour’s, not their own', async () => {
    render(<ViolationReportForm communityId={42} ownUnitIds={[1]} />);

    fireEvent.change(screen.getByLabelText(/unit the report is about/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Music at 2am.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit violation report/i }));

    await waitFor(() =>
      expect(createViolationMock).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 42, unitId: 2, category: 'noise' }),
      ),
    );
  });

  it('asks for the unit in plain words when none is picked', async () => {
    render(<ViolationReportForm communityId={42} ownUnitIds={[1]} />);

    fireEvent.click(screen.getByRole('button', { name: /submit violation report/i }));

    expect(await screen.findByText('Please select the unit the report is about')).toBeVisible();
    expect(createViolationMock).not.toHaveBeenCalled();
  });

  it('points common-area problems to a maintenance request', () => {
    render(<ViolationReportForm communityId={42} ownUnitIds={[1]} />);

    expect(screen.getByRole('link', { name: 'submit a maintenance request' })).toHaveAttribute(
      'href',
      '/communities/42/operations?tab=requests',
    );
  });
});
