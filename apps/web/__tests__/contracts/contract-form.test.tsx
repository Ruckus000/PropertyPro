/**
 * The contract form (New and Edit).
 *
 * This file runs in a NON-UTC process time zone on purpose. The bug it guards:
 * the old form loaded the stored ISO time with `.slice(0, 16)` (UTC digits)
 * into a `datetime-local` field and saved `new Date(value).toISOString()`
 * (browser-local), so every edit-and-save moved the bidding-close time by the
 * editor's offset from UTC. In a UTC process that bug is invisible. The first
 * test asserts the zone took effect, so this cannot pass vacuously.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  // Before any module that touches Date is loaded.
  const originalTz = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  return {
    originalTz,
    create: vi.fn(),
    update: vi.fn(),
    router: { push: vi.fn(), refresh: vi.fn() },
    saveError: null as Error | null,
  };
});

// Radix Select and Checkbox need these in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/hooks/use-contracts', () => ({
  useCreateContract: () => ({ mutateAsync: h.create, isPending: false, error: h.saveError }),
  useUpdateContract: () => ({ mutateAsync: h.update, isPending: false, error: h.saveError }),
}));

import {
  ContractForm,
  closingTimeFromInput,
  closingTimeToInput,
  type ContractFormValues,
} from '../../src/components/contracts/contract-form';
import { CLOSING_TIME_LOCKED_MESSAGE } from '../../src/lib/contracts/bid-sealing';
import {
  CONTRACT_AMOUNT_MESSAGE,
  CONTRACT_AMOUNT_TOO_LARGE_MESSAGE,
  CONTRACT_CLOSING_TIME_MESSAGE,
  CONTRACT_END_BEFORE_START_MESSAGE,
  CONTRACT_TITLE_REQUIRED_MESSAGE,
  CONTRACT_VENDOR_REQUIRED_MESSAGE,
} from '../../src/lib/contracts/contract-rules';

const TZ = 'America/New_York';
/** 5:00:30 pm EST. The seconds are there on purpose: the field cannot show them. */
const STORED_CLOSE = '2026-12-12T22:00:30.000Z';

const STORED: ContractFormValues = {
  id: 7,
  title: 'Roof replacement',
  vendorName: 'RoofCo',
  description: 'Replace the flat roof',
  contractValue: '50000.00',
  startDate: '2027-01-01',
  endDate: '2027-06-30',
  biddingClosesAt: STORED_CLOSE,
  conflictOfInterest: false,
  conflictOfInterestNote: null,
  status: 'active',
  documentId: 100,
  complianceChecklistItemId: null,
};

function renderNew() {
  return render(<ContractForm communityId={42} timeZone={TZ} />);
}
function renderEdit(over: Partial<ContractFormValues> = {}) {
  return render(<ContractForm communityId={42} timeZone={TZ} contract={{ ...STORED, ...over }} />);
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillRequired() {
  type(/^Title/, 'Elevator service');
  type(/^Vendor name/, 'LiftCo');
  type(/^Start date/, '2026-03-01');
}
function pickStatus(option: string) {
  fireEvent.pointerDown(screen.getByLabelText('Status'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}
async function save(name = 'Save contract') {
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('ContractForm', () => {
  afterAll(() => {
    // Leave the worker as it was found, in case it runs another file.
    if (h.originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = h.originalTz;
  });

  beforeEach(() => {
    h.create.mockReset().mockResolvedValue({ id: 99 });
    h.update.mockReset().mockResolvedValue({ id: 7 });
    h.router.push.mockReset();
    h.router.refresh.mockReset();
    h.saveError = null;
  });

  describe('bidding-close time, in a process that is not on UTC', () => {
    it('this process really is off UTC (or the tests below prove nothing)', () => {
      expect(new Date('2026-12-12T22:00:00.000Z').getTimezoneOffset()).toBe(-540);
    });

    it('opening Edit and saving another field does not send the closing time at all, so it cannot move', async () => {
      renderEdit();
      // The community's wall clock (EST), not UTC's digits and not Tokyo's.
      expect(screen.getByLabelText('Bidding closes at')).toHaveValue('2026-12-12T17:00');

      type(/^Title/, 'Roof replacement (phase 1)');
      await save('Save changes');

      expect(h.update).toHaveBeenCalledTimes(1);
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, title: 'Roof replacement (phase 1)' });
    });

    it('typing the same time back in is not a change either (the field cannot show the stored seconds)', async () => {
      renderEdit();
      type('Bidding closes at', '2026-12-13T08:00');
      type('Bidding closes at', '2026-12-12T17:00');
      await save('Save changes');
      expect(h.update).not.toHaveBeenCalled();
    });

    it('a time the field accepts but that is not a real one (a six-digit year) gets a message, and nothing is sent', async () => {
      renderEdit();
      type('Bidding closes at', '202600-01-01T10:00');
      // jsdom kept the value: the form really was asked to convert it.
      expect(screen.getByLabelText('Bidding closes at')).toHaveValue('202600-01-01T10:00');
      await save('Save changes');

      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_CLOSING_TIME_MESSAGE);
      expect(screen.getByLabelText('Bidding closes at')).toHaveAttribute('aria-invalid', 'true');
      expect(h.update).not.toHaveBeenCalled();
      expect(h.router.push).not.toHaveBeenCalled();
    });

    it('a stored time zone Intl does not know does not crash the form', () => {
      render(<ContractForm communityId={42} timeZone="Not/A_Zone" contract={STORED} />);
      // Falls back to Eastern time, as the other zoned helpers do.
      expect(screen.getByLabelText('Bidding closes at')).toHaveValue('2026-12-12T17:00');
    });

    it("a new time is read in the community's time zone", async () => {
      renderEdit();
      type('Bidding closes at', '2026-12-15T09:30');
      await save('Save changes');
      // 9:30 am EST is 14:30 UTC.
      // And it is the only field sent: in the audit trail the change stands alone.
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, biddingClosesAt: '2026-12-15T14:30:00.000Z' });
    });

    it('clearing the field clears the time', async () => {
      renderEdit();
      type('Bidding closes at', '');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0].biddingClosesAt).toBeNull();
    });

    it('converts both ways across daylight time, and passes an untouched value through', () => {
      // Summer: EDT is UTC-4.
      expect(closingTimeToInput('2026-07-01T21:00:00.000Z', TZ)).toBe('2026-07-01T17:00');
      expect(closingTimeFromInput('2026-07-01T17:00', TZ, null)).toBe('2026-07-01T21:00:00.000Z');
      // Winter: EST is UTC-5.
      expect(closingTimeToInput('2026-12-12T22:00:00.000Z', TZ)).toBe('2026-12-12T17:00');
      expect(closingTimeFromInput('2026-12-12T17:00', TZ, null)).toBe('2026-12-12T22:00:00.000Z');
      expect(closingTimeFromInput('2026-12-12T17:00', TZ, STORED_CLOSE)).toBe(STORED_CLOSE);
      expect(closingTimeToInput(null, TZ)).toBe('');
      expect(closingTimeFromInput('', TZ, STORED_CLOSE)).toBeNull();
    });
  });

  describe('a sealed contract that already has bids', () => {
    function renderLocked() {
      return render(<ContractForm communityId={42} timeZone={TZ} contract={STORED} closingTimeLocked />);
    }

    it('says up front that the closing time can only move later', () => {
      renderLocked();
      expect(screen.getByText(new RegExp(CLOSING_TIME_LOCKED_MESSAGE.replace(/\./g, '\\.')))).toBeInTheDocument();
    });

    it('refuses clearing the closing time, and sends nothing', async () => {
      renderLocked();
      type('Bidding closes at', '');
      await save('Save changes');

      expect(screen.getByRole('alert')).toHaveTextContent(CLOSING_TIME_LOCKED_MESSAGE);
      expect(h.update).not.toHaveBeenCalled();
    });

    it('refuses an earlier closing time, and sends nothing', async () => {
      renderLocked();
      type('Bidding closes at', '2026-12-01T09:00');
      await save('Save changes');

      expect(screen.getByRole('alert')).toHaveTextContent(CLOSING_TIME_LOCKED_MESSAGE);
      expect(h.update).not.toHaveBeenCalled();
    });

    it('sends a later closing time', async () => {
      renderLocked();
      type('Bidding closes at', '2026-12-20T17:00');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, biddingClosesAt: '2026-12-20T22:00:00.000Z' });
    });

    it('other fields save as usual', async () => {
      renderLocked();
      type(/^Title/, 'Renamed');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, title: 'Renamed' });
    });

    it('control: without bids the same contract can have its closing time cleared', async () => {
      renderEdit();
      type('Bidding closes at', '');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, biddingClosesAt: null });
    });
  });

  describe('what it refuses', () => {
    it('1,200 as a value: the stated message, and nothing is sent', async () => {
      renderNew();
      fillRequired();
      type('Contract value ($)', '1,200');
      await save();

      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_AMOUNT_MESSAGE);
      expect(screen.getByLabelText('Contract value ($)')).toHaveAttribute('aria-invalid', 'true');
      expect(h.create).not.toHaveBeenCalled();

      // Corrected, it goes through.
      type('Contract value ($)', '1200');
      await save();
      expect(h.create).toHaveBeenCalledTimes(1);
      expect(h.create.mock.calls[0]![0].contractValue).toBe('1200');
    });

    it('an amount the column cannot hold: a message about its size, and nothing is sent', async () => {
      renderNew();
      fillRequired();
      type('Contract value ($)', '10000000000');
      await save();

      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);
      expect(h.create).not.toHaveBeenCalled();
    });

    it('a title or vendor name made only of spaces: a message naming the field, and nothing is sent', async () => {
      renderNew();
      fillRequired();
      type(/^Title/, '   ');
      type(/^Vendor name/, '  ');
      await save();

      const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
      expect(alerts).toEqual([CONTRACT_TITLE_REQUIRED_MESSAGE, CONTRACT_VENDOR_REQUIRED_MESSAGE]);
      expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
      expect(h.create).not.toHaveBeenCalled();
    });

    it('an end date before the start date: the stated message, and nothing is sent', async () => {
      renderNew();
      fillRequired();
      type('End date', '2026-02-28');
      await save();

      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_END_BEFORE_START_MESSAGE);
      expect(screen.getByLabelText('End date')).toHaveAttribute('aria-invalid', 'true');
      expect(h.create).not.toHaveBeenCalled();
    });

    it("shows the server's message when the save is refused, and stays on the form", async () => {
      h.saveError = new Error('Document not found in this community');
      h.create.mockRejectedValue(h.saveError);
      renderNew();
      fillRequired();
      await save();

      expect(screen.getByRole('alert')).toHaveTextContent('Document not found in this community');
      expect(h.router.push).not.toHaveBeenCalled();
    });
  });

  describe('status and the conflict-of-interest note', () => {
    it('a new contract starts Active and can be saved as Draft', async () => {
      renderNew();
      fillRequired();
      expect(screen.getByLabelText('Status')).toHaveTextContent('Active');
      pickStatus('Draft');
      await save();
      expect(h.create.mock.calls[0]![0].status).toBe('draft');
    });

    it('Edit shows the stored status, and a contract can be marked Terminated', async () => {
      renderEdit({ status: 'expired' });
      expect(screen.getByLabelText('Status')).toHaveTextContent('Expired');
      pickStatus('Terminated');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, status: 'terminated' });
    });

    it('a stored status that is not one of the four is shown as it is and never rewritten by a save', async () => {
      renderEdit({ status: 'archived' });
      expect(screen.getByLabelText('Status')).toHaveTextContent('archived');
      expect(screen.getByLabelText('Status')).not.toHaveTextContent('Active');

      type(/^Title/, 'Renamed');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, title: 'Renamed' });
    });

    it('an unknown stored status is replaced only when the manager chooses another', async () => {
      renderEdit({ status: 'archived' });
      pickStatus('Terminated');
      await save('Save changes');
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, status: 'terminated' });
    });

    it('the note field appears only once the conflict box is ticked, and is saved', async () => {
      renderNew();
      fillRequired();
      expect(screen.queryByLabelText('Conflict of interest note')).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText('Conflict of interest declared'));
      type('Conflict of interest note', 'Treasurer owns the vendor');
      await save();

      expect(h.create.mock.calls[0]![0]).toMatchObject({
        conflictOfInterest: true,
        conflictOfInterestNote: 'Treasurer owns the vendor',
      });
    });

    it('Edit shows the stored note, and unticking the box clears it', async () => {
      renderEdit({ conflictOfInterest: true, conflictOfInterestNote: 'Treasurer owns the vendor' });
      expect(screen.getByLabelText('Conflict of interest note')).toHaveValue('Treasurer owns the vendor');

      await userEvent.click(screen.getByLabelText('Conflict of interest declared'));
      await save('Save changes');

      expect(h.update.mock.calls[0]![0]).toEqual({
        id: 7,
        conflictOfInterest: false,
        conflictOfInterestNote: null,
      });
    });
  });

  describe('saving', () => {
    it('a new contract sends every field, then opens the new contract and reloads it', async () => {
      renderNew();
      fillRequired();
      type('Description', 'Monthly service');
      type('Contract value ($)', '12500.50');
      type('End date', '2027-03-01');
      type('Linked Document ID', '42');
      type('Compliance Checklist Item ID', '7');
      await save();

      expect(h.create).toHaveBeenCalledWith({
        title: 'Elevator service',
        vendorName: 'LiftCo',
        description: 'Monthly service',
        contractValue: '12500.50',
        startDate: '2026-03-01',
        endDate: '2027-03-01',
        status: 'active',
        biddingClosesAt: null,
        conflictOfInterest: false,
        conflictOfInterestNote: null,
        documentId: 42,
        complianceChecklistItemId: 7,
      });
      await waitFor(() => expect(h.router.push).toHaveBeenCalledWith('/contracts/99?communityId=42'));
      expect(h.router.refresh).toHaveBeenCalled();
    });

    it('an edit that changes nothing sends nothing, and goes back to the contract', async () => {
      renderEdit();
      await save('Save changes');

      expect(h.update).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      await waitFor(() => expect(h.router.push).toHaveBeenCalledWith('/contracts/7?communityId=42'));
    });

    it('an edit sends the id and only the fields that changed, then lands on the contract', async () => {
      renderEdit();
      type('End date', '2027-12-31');
      type('Linked Document ID', '');
      await save('Save changes');

      expect(h.update).toHaveBeenCalledTimes(1);
      expect(h.update.mock.calls[0]![0]).toEqual({ id: 7, endDate: '2027-12-31', documentId: null });
      await waitFor(() => expect(h.router.push).toHaveBeenCalledWith('/contracts/7?communityId=42'));
      expect(h.create).not.toHaveBeenCalled();
    });

    it('has one button, Save: Cancel is in the page header', () => {
      renderNew();
      expect(screen.getAllByRole('button').filter((b) => b.getAttribute('type') === 'submit')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Cancel' })).not.toBeInTheDocument();
    });
  });
});
