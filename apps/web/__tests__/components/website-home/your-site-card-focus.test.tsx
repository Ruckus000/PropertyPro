/**
 * Where keyboard focus lands after the Versions tab's restore confirm closes.
 *
 * Uses the REAL `ConfirmDialog` (Radix alert-dialog): `website-home.test.tsx`
 * stubs the dialog and so cannot see focus. The restore hook is mocked; what it
 * sends is covered by `use-restore-previous-site.test.tsx`.
 *
 * The restore is held open until the dialog has closed, as it is in a browser
 * (a restore is several requests). Clicking Restore closes the dialog at once,
 * and Radix hands focus back while the opener is still disabled by its loading
 * state, so that hand-back is lost. A restore that resolves instantly hides
 * this: the opener is enabled again before Radix's deferred hand-back runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { restoreLatestMock, restoreSnapshotMock, refreshMock } = vi.hoisted(() => ({
  restoreLatestMock: vi.fn(),
  restoreSnapshotMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-restore-previous-site', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-restore-previous-site')>()),
  useRestorePreviousSite: () => ({ restoreLatest: restoreLatestMock, restoreSnapshot: restoreSnapshotMock }),
}));
// The real dialog, without `next/dynamic` in between.
vi.mock('@/components/website-home/website-home-lazy', async () => ({
  LazyConfirmDialog: (await import('@/components/pm/site-editor-v3/ConfirmDialog')).ConfirmDialog,
}));

import { YourSiteCard } from '@/components/website-home/your-site-card';
import { RestoreError } from '@/hooks/use-restore-previous-site';

function renderCard() {
  return render(
    <YourSiteCard
      communityId={1}
      liveLookId={null}
      draftLookId={null}
      pendingDraftCount={0}
      history={[
        { snapshotId: 3, publishedAt: '2026-11-08T12:00:00.000Z', byName: null, restorable: true },
        { snapshotId: 2, publishedAt: '2026-11-07T12:00:00.000Z', byName: null, restorable: true },
      ]}
      previousSnapshotId={2}
      publishToken="2026-11-08T12:00:00.000Z"
      formatDateTime={(iso) => iso}
    />,
  );
}

/** A restore that settles only when `settle` is called. */
let settle: (outcome?: Error) => void = () => {};
function heldRestore() {
  return new Promise<void>((resolve, reject) => {
    settle = (outcome) => (outcome ? reject(outcome) : resolve());
  });
}

/** Confirms, lets Radix finish closing the dialog, THEN finishes the restore. */
async function confirmRestore(user: ReturnType<typeof userEvent.setup>, opener: HTMLElement, outcome?: Error) {
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  // Radix returns focus in a setTimeout after unmount; let it run while the opener is still loading.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(opener).toBeDisabled();
  await act(async () => settle(outcome));
  await waitFor(() => expect(opener).not.toBeDisabled());
}

beforeEach(() => {
  vi.clearAllMocks();
  restoreLatestMock.mockImplementation(heldRestore);
  restoreSnapshotMock.mockImplementation(heldRestore);
});

describe('YourSiteCard restore focus', () => {
  it('a confirmed "Restore previous version" puts focus back on that button', async () => {
    const user = userEvent.setup();
    renderCard();
    const opener = screen.getByRole('button', { name: 'Restore previous version' });

    await user.click(opener);
    await confirmRestore(user, opener);

    expect(restoreLatestMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("a confirmed per-version Restore puts focus back on that version's button", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'See earlier versions' }));
    const opener = screen.getByRole('button', { name: /^Restore the version from/ });

    await user.click(opener);
    await confirmRestore(user, opener);

    expect(restoreSnapshotMock).toHaveBeenCalledWith(2);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('a failed restore also puts focus back on the button, with the reason shown', async () => {
    const user = userEvent.setup();
    renderCard();
    const opener = screen.getByRole('button', { name: 'Restore previous version' });

    await user.click(opener);
    await confirmRestore(user, opener, new RestoreError('failed', 'We could not restore it.'));

    expect(screen.getByRole('status')).toHaveTextContent('We could not restore it.');
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('Cancel puts focus back on the button (control: closes through onOpenChange)', async () => {
    const user = userEvent.setup();
    renderCard();
    const opener = screen.getByRole('button', { name: 'Restore previous version' });

    await user.click(opener);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(restoreLatestMock).not.toHaveBeenCalled();
  });
});
