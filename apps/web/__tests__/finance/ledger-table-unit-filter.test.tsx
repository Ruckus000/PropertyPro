/** LedgerTable narrowed to one unit: the fetch carries the unit, and the chip clears it. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { useLedgerMock } = vi.hoisted(() => ({ useLedgerMock: vi.fn() }));
vi.mock('@/hooks/use-finance', () => ({ useLedger: useLedgerMock }));

import { LedgerTable } from '../../src/components/finance/ledger-table';

describe('LedgerTable unit filter', () => {
  it('fetches only that unit and offers a way back to all units', async () => {
    useLedgerMock.mockReturnValue({ data: [{ id: 1, unitId: 7, unitLabel: 'Unit 4B', entryType: 'charge', description: 'Dues', amountCents: 100, createdAt: '2026-09-01T00:00:00Z' }], isLoading: false });
    const onShowAllUnits = vi.fn();
    render(<LedgerTable communityId={3} unitId={7} onShowAllUnits={onShowAllUnits} />);
    expect(useLedgerMock).toHaveBeenCalledWith(3, expect.objectContaining({ unitId: 7 }));
    expect(screen.getByText(/Unit 4B only/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show all units' }));
    expect(onShowAllUnits).toHaveBeenCalled();
  });
});
