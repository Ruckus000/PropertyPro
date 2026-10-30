/**
 * The "Doesn't apply" dialog (website builder, D13).
 *
 * Only the checklist mutation is mocked. The point of most cases is what the
 * dialog refuses to send: the server wants a reason of 1 to 200 characters, and
 * the error text `useComplianceMutations` produces is wrong (it reads a
 * top-level `message` the envelope does not have), so the dialog validates
 * first and words its own failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { markMock } = vi.hoisted(() => ({ markMock: vi.fn() }));

vi.mock('@/hooks/use-compliance-mutations', () => ({
  useComplianceMutations: () => ({ markNotApplicable: { mutateAsync: markMock } }),
}));

import { NotApplicableDialog } from '@/components/website-home/records/not-applicable-dialog';

const COMMUNITY_ID = 42;
const SIRS = { itemId: 5, templateKey: '718_sirs', title: 'Structural integrity reserve study' };
const BIDS = { itemId: 7, templateKey: '718_bids', title: 'Bids received' };

function setup(item = SIRS) {
  const onDone = vi.fn();
  render(<NotApplicableDialog communityId={COMMUNITY_ID} item={item} onDone={onDone} />);
  return { onDone, user: userEvent.setup({ pointerEventsCheck: 0 }) };
}

const confirm = () => screen.getByRole('button', { name: 'Mark as not applying' });

beforeEach(() => {
  vi.clearAllMocks();
  markMock.mockResolvedValue(undefined);
});

describe('NotApplicableDialog', () => {
  it('the dialog requires a reason', async () => {
    const { user, onDone } = setup();

    await user.click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a reason');
    expect(markMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    // "Another reason" needs words of its own, and spaces are not words.
    await user.click(screen.getByLabelText('Another reason'));
    await user.type(screen.getByRole('textbox', { name: 'Your reason' }), '   ');
    await user.click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('Write a few words');
    expect(markMock).not.toHaveBeenCalled();
  });

  it('saves a fixed reason as written and reports that the record was marked', async () => {
    const { user, onDone } = setup();

    await user.click(screen.getByLabelText('The building is under three stories'));
    await user.click(confirm());

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(markMock).toHaveBeenCalledWith({ itemId: 5, reason: 'The building is under three stories' });
  });

  it('offers the choices that fit the record, and Another reason for every record', () => {
    const { } = setup(BIDS);

    expect(screen.getByLabelText('No bidding period has closed')).toBeInTheDocument();
    expect(screen.getByLabelText('Another reason')).toBeInTheDocument();
    expect(screen.queryByLabelText('The building is under three stories')).not.toBeInTheDocument();
  });

  it.each([
    ['718_inspection_reports', 'The building is under three stories'],
    ['718_sirs', 'The building is under three stories'],
    ['718_bids', 'No bidding period has closed'],
    ['720_bids', 'No bidding period has closed'],
    ['718_video_recordings', "We don't hold meetings by video"],
    ['718_conflict_contracts', 'No contracts with directors or officers'],
  ])('%s offers "%s"', (templateKey, reason) => {
    setup({ itemId: 1, templateKey, title: 'A record' });

    expect(screen.getByLabelText(reason)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('Another reason opens a text box capped at 200 characters and saves it trimmed', async () => {
    const { user, onDone } = setup();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Another reason'));
    const box = screen.getByRole('textbox', { name: 'Your reason' });
    expect(box).toHaveAttribute('maxlength', '200');
    await user.type(box, '  We share one roof with the bank next door.  ');
    await user.click(confirm());

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(markMock).toHaveBeenCalledWith({ itemId: 5, reason: 'We share one roof with the bank next door.' });
  });

  it('refuses a reason over 200 characters before it reaches the server', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText('Another reason'));
    // `maxLength` stops typing; a paste or a script is not stopped by it.
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reason' }), { target: { value: 'x'.repeat(201) } });

    await user.click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('200 characters or fewer');
    expect(markMock).not.toHaveBeenCalled();
  });

  it('explains a failed save in its own words and stays open to try again', async () => {
    markMock.mockRejectedValueOnce(new Error('PATCH failed: 400'));
    const { user, onDone } = setup();
    await user.click(screen.getByLabelText('The building is under three stories'));

    await user.click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save that. Please try again.");
    expect(screen.queryByText(/PATCH failed/)).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await user.click(confirm());
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it('Cancel closes without saving', async () => {
    const { user, onDone } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDone).toHaveBeenCalledWith(false);
    expect(markMock).not.toHaveBeenCalled();
  });
});
