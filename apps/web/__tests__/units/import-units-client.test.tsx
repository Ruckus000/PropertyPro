/** Import units screen: choose a file → preview (nothing saved) → import → results. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }));
vi.mock('@/hooks/use-import-units', () => ({
  useImportUnits: () => ({ mutateAsync: mutateAsyncMock, isPending: false, error: null, reset: vi.fn() }),
}));

import { ImportUnitsClient } from '../../src/components/units/import-units-client';

const unit = { rowNumber: 2, unitNumber: '101', building: 'A', floor: 1, bedrooms: 2, bathrooms: 1, sqft: 900, occupancy: 'vacant' };

describe('ImportUnitsClient', () => {
  beforeEach(() => mutateAsyncMock.mockReset());

  it('previews the file, then imports the valid rows', async () => {
    mutateAsyncMock
      .mockResolvedValueOnce({ units: [unit], errors: [{ rowNumber: 3, column: 'unit_number', message: "Unit '4b' already exists" }], importedCount: 0, skippedCount: 1, dryRun: true })
      .mockResolvedValueOnce({ units: [unit], errors: [], importedCount: 1, skippedCount: 0, dryRun: false });
    const user = userEvent.setup();
    render(<ImportUnitsClient communityId={42} />);

    const file = new File(['unit_number\n101\n4b\n'], 'units.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText(/choose csv file/i), file);

    expect(mutateAsyncMock).toHaveBeenNthCalledWith(1, { csv: 'unit_number\n101\n4b\n', dryRun: true });
    expect(await screen.findByText(/ready to import/)).toHaveTextContent('1 unit ready to import, 1 with problems. Nothing has been saved yet.');
    expect(screen.getByText(/Row 3: Unit '4b' already exists/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 1 unit' }));
    expect(mutateAsyncMock).toHaveBeenNthCalledWith(2, { csv: 'unit_number\n101\n4b\n', dryRun: false });
    expect(await screen.findByText('1 unit imported')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View units' })).toHaveAttribute('href', '/dashboard/directory?communityId=42&tab=units');
  });
});
