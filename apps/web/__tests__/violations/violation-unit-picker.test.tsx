/**
 * The report form with the REAL unit picker (`ViolationUnitPicker` +
 * `useViolationUnitOptions`); only `useUnits`, the API and the upload are
 * mocked. Ported from the deleted ViolationReportForm / StaffViolationReportForm
 * tests: own-unit marking and sort order, the unit-load error, ordered photo
 * uploads feeding `evidenceDocumentIds`, the maintenance-request pointer, and a
 * resident filing against a neighbour's unit (D1).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createViolationMock, pushMock, uploadEvidencePhotoMock, useUnitsMock } = vi.hoisted(() => ({
  createViolationMock: vi.fn(),
  pushMock: vi.fn(),
  uploadEvidencePhotoMock: vi.fn(),
  useUnitsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/hooks/use-units', () => ({ useUnits: useUnitsMock }));
vi.mock('@/lib/api/violations', () => ({ createViolation: createViolationMock }));
vi.mock('@/lib/violations/evidence-upload', () => ({ uploadEvidencePhoto: uploadEvidencePhotoMock }));

import { ReportViolationPage } from '@/components/violations/report-violation-page';

function unit(id: number, unitNumber: string, building: string | null = null) {
  return { id, communityId: 42, unitNumber, building };
}

// Deliberately out of order. 'Unit 9' before 'Unit 10' only holds with numeric
// collation; a plain string sort puts 10 first.
const UNITS = [unit(3, '10'), unit(1, '2', 'B'), unit(4, '9'), unit(2, '1', 'A')];

function view(mode: 'resident' | 'staff' = 'resident', ownUnitIds: number[] = [1]) {
  return render(<ReportViolationPage communityId={42} mode={mode} ownUnitIds={ownUnitIds} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  useUnitsMock.mockReturnValue({ data: UNITS, error: null, isLoading: false });
  createViolationMock.mockResolvedValue({ data: { id: 99 } });
});

describe('report form with the real unit picker', () => {
  it('loads units through the hook, sorts them building-aware and numeric, and marks the reporter’s own', () => {
    view('resident', [1]);

    expect(useUnitsMock).toHaveBeenCalledWith(42);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    // The severity control is radios, so every option here is the unit picker's.
    expect(options).toEqual(expect.arrayContaining(['Select a unit…']));
    const unitOptions = options.filter((o) => o !== 'Select a unit…' && /Unit/.test(o ?? ''));
    expect(unitOptions).toEqual(['A • Unit 1', 'B • Unit 2 (your unit)', 'Unit 9', 'Unit 10']);
  });

  it('shows a unit-load error and keeps Submit disabled', () => {
    useUnitsMock.mockReturnValue({ data: undefined, error: new Error('Failed to load units'), isLoading: false });

    view('resident');

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load units');
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeDisabled();
  });

  it('uploads photos in order and sends their ids as evidenceDocumentIds', async () => {
    uploadEvidencePhotoMock.mockResolvedValueOnce(101).mockResolvedValueOnce(102);
    view('staff');

    fireEvent.change(screen.getByLabelText(/resident's unit/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'noise' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Major' }));
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Loud music after quiet hours.' } });
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ];
    fireEvent.change(screen.getByLabelText(/Photos/), { target: { files } });

    fireEvent.click(screen.getByRole('button', { name: 'File report' }));

    await waitFor(() =>
      expect(createViolationMock).toHaveBeenCalledWith({
        communityId: 42,
        unitId: 2,
        category: 'noise',
        description: 'Loud music after quiet hours.',
        severity: 'major',
        evidenceDocumentIds: [101, 102],
      }),
    );
    expect(uploadEvidencePhotoMock).toHaveBeenCalledTimes(2);
    expect(uploadEvidencePhotoMock).toHaveBeenNthCalledWith(1, 42, files[0], 0);
    expect(uploadEvidencePhotoMock).toHaveBeenNthCalledWith(2, 42, files[1], 1);
    // Uploads finish before the report is created.
    expect(uploadEvidencePhotoMock.mock.invocationCallOrder[1]!).toBeLessThan(
      createViolationMock.mock.invocationCallOrder[0]!,
    );
  });

  it('points common-area problems to a maintenance request', () => {
    view('resident');

    expect(screen.getByRole('link', { name: 'submit a maintenance request' })).toHaveAttribute(
      'href',
      '/communities/42/operations?tab=requests',
    );
  });

  it('files against the unit the resident picked — a neighbour’s, not their own', async () => {
    view('resident', [1]);

    fireEvent.change(screen.getByLabelText(/unit the report is about/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'noise' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Music at 2am.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() =>
      expect(createViolationMock).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 42, unitId: 3, category: 'noise' }),
      ),
    );
    expect(uploadEvidencePhotoMock).not.toHaveBeenCalled();
  });
});
