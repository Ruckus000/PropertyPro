/** Import units screen: choose a file → preview (nothing saved) → import → results. */
import { render, screen, waitFor, within } from '@testing-library/react';
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

  async function toReview(user: ReturnType<typeof userEvent.setup>) {
    mutateAsyncMock.mockResolvedValueOnce({ units: [unit, { ...unit, rowNumber: 3, unitNumber: '102', building: null, floor: null }], errors: [], importedCount: 0, skippedCount: 0, dryRun: true });
    render(<ImportUnitsClient communityId={42} />);
    await user.upload(screen.getByLabelText(/choose csv file/i), new File(['unit_number\n101\n102\n'], 'units.csv', { type: 'text/csv' }));
    await screen.findByText(/ready to import/);
  }

  function currentStep() {
    const items = within(screen.getByRole('list', { name: 'Import steps' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('[data-step-name]')!.textContent)).toEqual(['Choose file', 'Review', 'Done']);
    const current = items.filter((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    return current[0]!.querySelector('[data-step-name]')!.textContent;
  }

  it('the step strip follows the import: Choose file, Review, Done', async () => {
    const user = userEvent.setup();
    render(<ImportUnitsClient communityId={42} />);
    expect(currentStep()).toBe('Choose file');

    mutateAsyncMock
      .mockResolvedValueOnce({ units: [unit], errors: [], importedCount: 0, skippedCount: 0, dryRun: true })
      .mockResolvedValueOnce({ units: [unit], errors: [], importedCount: 1, skippedCount: 0, dryRun: false });
    await user.upload(screen.getByLabelText(/choose csv file/i), new File(['unit_number\n101\n'], 'units.csv', { type: 'text/csv' }));
    await waitFor(() => expect(currentStep()).toBe('Review'));

    await user.click(screen.getByRole('button', { name: 'Import 1 unit' }));
    await waitFor(() => expect(currentStep()).toBe('Done'));
  });

  it('moves focus to the new step, and not on first render', async () => {
    const user = userEvent.setup();
    render(<ImportUnitsClient communityId={42} />);
    expect(document.activeElement).toBe(document.body);

    mutateAsyncMock.mockResolvedValueOnce({ units: [unit], errors: [], importedCount: 0, skippedCount: 0, dryRun: true });
    await user.upload(screen.getByLabelText(/choose csv file/i), new File(['unit_number\n101\n'], 'units.csv', { type: 'text/csv' }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Import step'));
  });

  it('the header has Cancel only, back to the Directory units tab', () => {
    render(<ImportUnitsClient communityId={42} />);
    const header = document.querySelector('[data-page-header]') as HTMLElement;
    expect(within(header).getByRole('heading', { level: 1, name: 'Import units' })).toBeInTheDocument();
    const links = within(header).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Cancel');
    expect(links[0]).toHaveAttribute('href', '/dashboard/directory?communityId=42&tab=units');
    expect(within(header).queryByRole('button')).toBeNull();
    expect(document.querySelector('[data-page-template="form"]')).not.toBeNull();
  });

  it('previews five columns, with building and floor under the unit number', async () => {
    await toReview(userEvent.setup());

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Unit', 'Beds', 'Baths', 'Sq ft', 'Occupancy']);
    const [, first, second] = screen.getAllByRole('row');
    const cells = within(first!).getAllByRole('cell');
    expect(cells).toHaveLength(5);
    expect(cells[0]!.querySelector('[data-unit]')).toHaveTextContent('101');
    expect(cells[0]!.querySelector('[data-place]')).toHaveTextContent('Building A · Floor 1');
    expect(cells.slice(1).map((c) => c.textContent)).toEqual(['2', '1', '900', 'Vacant']);
    // Narrow boxes hide Beds, Baths and Sq ft; the unit cell carries them instead.
    expect(cells[0]!.querySelector('[data-narrow]')).toHaveTextContent('2 bd · 1 ba · 900 sq ft');
    expect(cells[0]!.querySelector('[data-narrow]')).toHaveClass('cq-sm:hidden');
    // A unit with no building or floor has no second line.
    expect(within(second!).getAllByRole('cell')[0]!.querySelector('[data-place]')).toBeNull();
  });

  it('Back from the review returns to the file chooser', async () => {
    const user = userEvent.setup();
    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText(/choose csv file/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
