import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffViolationReportForm } from '../../src/components/violations/StaffViolationReportForm';

const {
  createViolationMock,
  refreshMock,
  uploadEvidencePhotoMock,
  useUnitsMock,
} = vi.hoisted(() => ({
  createViolationMock: vi.fn(),
  refreshMock: vi.fn(),
  uploadEvidencePhotoMock: vi.fn(),
  useUnitsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/hooks/use-units', () => ({
  useUnits: useUnitsMock,
}));

vi.mock('@/lib/api/violations', () => ({
  createViolation: createViolationMock,
}));

vi.mock('@/lib/violations/evidence-upload', () => ({
  uploadEvidencePhoto: uploadEvidencePhotoMock,
}));

const units = [
  {
    id: 3,
    communityId: 42,
    unitNumber: '10',
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
  {
    id: 1,
    communityId: 42,
    unitNumber: '2',
    building: 'B',
    floor: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    rentAmount: null,
    ownerUserId: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 2,
    communityId: 42,
    unitNumber: '1',
    building: 'A',
    floor: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    rentAmount: null,
    ownerUserId: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

describe('StaffViolationReportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUnitsMock.mockReturnValue({
      data: units,
      error: null,
      isLoading: false,
    });
    createViolationMock.mockResolvedValue({ data: { id: 99 } });
    uploadEvidencePhotoMock
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(102);
  });

  it('loads units through the hook and preserves building-aware numeric sorting', () => {
    render(<StaffViolationReportForm communityId={42} />);

    expect(useUnitsMock).toHaveBeenCalledWith(42);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options.slice(0, 4)).toEqual([
      'Select a unit…',
      'A • Unit 1',
      'B • Unit 2',
      'Unit 10',
    ]);
  });

  it('uploads evidence before creating the staff violation report', async () => {
    render(<StaffViolationReportForm communityId={42} />);

    fireEvent.change(screen.getByLabelText(/resident's unit/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: 'noise' },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Loud music after quiet hours.' },
    });
    fireEvent.change(screen.getByLabelText(/severity/i), {
      target: { value: 'major' },
    });

    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ];
    fireEvent.change(screen.getByLabelText(/photo evidence/i), {
      target: { files },
    });

    fireEvent.click(screen.getByRole('button', { name: /file violation report/i }));

    await waitFor(() => {
      expect(createViolationMock).toHaveBeenCalledWith({
        communityId: 42,
        unitId: 2,
        category: 'noise',
        description: 'Loud music after quiet hours.',
        severity: 'major',
        evidenceDocumentIds: [101, 102],
      });
    });

    expect(uploadEvidencePhotoMock).toHaveBeenNthCalledWith(1, 42, files[0], 0);
    expect(uploadEvidencePhotoMock).toHaveBeenNthCalledWith(2, 42, files[1], 1);
    expect(refreshMock).toHaveBeenCalled();
  });

  it('surfaces unit-load errors from the hook', () => {
    useUnitsMock.mockReturnValue({
      data: undefined,
      error: new Error('Failed to load units'),
      isLoading: false,
    });

    render(<StaffViolationReportForm communityId={42} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load units');
    expect(screen.getByRole('button', { name: /file violation report/i })).toBeDisabled();
  });
});
