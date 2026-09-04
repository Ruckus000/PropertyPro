/**
 * The requests table, and the row that can act on itself.
 *
 * The Document cell holds a disclosure AND a link. That combination is the
 * whole design, and it is also the thing most likely to be "simplified" back
 * into the whole-row-`<button>` pattern used elsewhere in the app — which would
 * nest an `<a>` inside a `<button>`, invalid HTML that browsers repair by
 * hoisting the link out of the button, leaving a focus order that no longer
 * matches the paint.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EsignRequest, EsignRequestSigner } from '@/lib/esign/submission-status';

// `vi.mock` factories are hoisted above every top-level binding, so anything
// they close over has to come from `vi.hoisted`.
const { routerPush, remindMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  remindMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => '/esign',
  useSearchParams: () => new URLSearchParams('communityId=3'),
}));

vi.mock('@/hooks/use-esign-submissions', () => ({
  useSendEsignReminder: () => ({ mutate: remindMutate, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { RequestsView } from '@/components/esign/requests-view';

const DAY = 24 * 60 * 60 * 1000;

function signer(over: Partial<EsignRequestSigner> = {}): EsignRequestSigner {
  return {
    id: 1,
    userId: null,
    name: 'Alice Owner',
    email: 'alice@test.com',
    role: 'owner',
    status: 'pending',
    sortOrder: 0,
    slug: 'slug-alice',
    completedAt: null,
    lastReminderAt: null,
    reminderCount: 0,
    ...over,
  };
}

function request(over: Partial<EsignRequest> = {}): EsignRequest {
  return {
    id: 7,
    externalId: 'ext-abc',
    messageSubject: 'Roof assessment proxy',
    templateName: 'Proxy Designation Form',
    status: 'pending',
    effectiveStatus: 'pending',
    signingOrder: 'parallel',
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    completedAt: null,
    createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    signedDocumentPath: null,
    signers: [signer()],
    ...over,
  };
}

function renderTable(requests: EsignRequest[]) {
  return render(
    <RequestsView
      communityId={3}
      requests={requests}
      now={new Date()}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the Document cell', () => {
  it('separates the disclosure from the link', () => {
    renderTable([request()]);

    const link = screen.getByRole('link', { name: 'Roof assessment proxy' });
    expect(link).toHaveAttribute('href', '/esign/submissions/7?communityId=3');

    const disclosure = screen.getByRole('button', {
      name: 'Signers for Roof assessment proxy',
    });
    expect(disclosure).toBeDefined();

    // The assertion that fails if anyone reintroduces the whole-row button.
    expect(link.closest('button')).toBeNull();
  });

  it('does not navigate from the row itself', () => {
    // The list this replaces put an onClick on a bare `<tr>` with no role, no
    // tabIndex and no key handler — no keyboard user could open a submission.
    renderTable([request()]);

    const cell = screen.getByText(/Proxy Designation Form/);
    cell.click();

    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('the disclosure', () => {
  it('mounts the signers only when open, and says so', async () => {
    const user = userEvent.setup();
    renderTable([request()]);

    const disclosure = screen.getByRole('button', {
      name: 'Signers for Roof assessment proxy',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('alice@test.com', { exact: false })).toBeNull();

    await user.click(disclosure);

    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/alice@test\.com/)).toBeDefined();
  });

  it('points aria-controls at a real element, and only while open', async () => {
    const user = userEvent.setup();
    renderTable([request()]);
    const disclosure = screen.getByRole('button', {
      name: 'Signers for Roof assessment proxy',
    });

    // A constant aria-controls would dangle here, which axe flags and assistive
    // tech cannot resolve.
    expect(disclosure).not.toHaveAttribute('aria-controls');

    await user.click(disclosure);

    const id = disclosure.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).not.toBeNull();
  });

  it('spans exactly the columns the header declares', async () => {
    const user = userEvent.setup();
    const { container } = renderTable([request()]);
    await user.click(screen.getByRole('button', { name: /^Signers for/ }));

    const headerCount = container.querySelectorAll('thead th').length;
    const panel = container.querySelector('tbody td[colspan]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('colspan')).toBe(String(headerCount));
  });

  it('opens one row at a time', async () => {
    const user = userEvent.setup();
    renderTable([
      request({ id: 7, messageSubject: 'First' }),
      request({ id: 8, messageSubject: 'Second', signers: [signer({ id: 2, email: 'bob@test.com' })] }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Signers for First' }));
    expect(screen.getByText(/alice@test\.com/)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Signers for Second' }));

    expect(screen.queryByText(/alice@test\.com/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Signers for First' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('collapses on Escape and gives focus back', async () => {
    // Collapsing while focus falls to <body> restarts a keyboard user at the
    // top of the page — the failure this test exists for.
    const user = userEvent.setup();
    renderTable([request()]);
    const disclosure = screen.getByRole('button', { name: /^Signers for/ });

    await user.click(disclosure);
    const copy = screen.getByRole('button', { name: /Copy link/i });
    copy.focus();

    await user.keyboard('{Escape}');

    expect(screen.queryByText(/alice@test\.com/)).toBeNull();
    expect(disclosure).toHaveFocus();
  });
});

describe('what a signer row offers', () => {
  it('withholds both verbs from a signer whose turn has not come', async () => {
    const user = userEvent.setup();
    renderTable([
      request({
        signingOrder: 'sequential',
        signers: [
          signer({ id: 1, sortOrder: 0, name: 'First', email: 'first@test.com' }),
          signer({ id: 2, sortOrder: 1, name: 'Second', email: 'second@test.com' }),
        ],
      }),
    ]);
    await user.click(screen.getByRole('button', { name: /^Signers for/ }));

    const panel = screen.getByRole('group', { name: /^Signers for/ });
    const rows = within(panel).getAllByRole('listitem');
    const blocked = rows[1] as HTMLElement;

    expect(within(blocked).getByText('Waiting its turn')).toBeDefined();
    // Offering the link would hand over a URL the signing page then refuses.
    expect(within(blocked).queryByRole('button', { name: /Copy link/i })).toBeNull();
    expect(within(blocked).queryByRole('button', { name: /Remind/i })).toBeNull();
  });

  it('drops Remind at the cap but keeps the link', async () => {
    const user = userEvent.setup();
    renderTable([request({ signers: [signer({ reminderCount: 3 })] })]);
    await user.click(screen.getByRole('button', { name: /^Signers for/ }));

    expect(screen.getByText('3 of 3 reminders sent')).toBeDefined();
    // Absent, not disabled — so the button and the API cannot disagree.
    expect(screen.queryByRole('button', { name: /Remind/i })).toBeNull();
    // Running out of reminders does not stop you sending the link yourself.
    expect(screen.getByRole('button', { name: /Copy link/i })).toBeDefined();
  });

  it('copies the signing link and confirms it', async () => {
    // `userEvent.setup()` installs its own clipboard stub, so the mock has to
    // go in AFTER it or it is silently replaced and writeText is never called.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderTable([request()]);
    await user.click(screen.getByRole('button', { name: /^Signers for/ }));
    await user.click(screen.getByRole('button', { name: /Copy link/i }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/sign/ext-abc/slug-alice`,
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('sends a reminder for the signer whose button was pressed', async () => {
    const user = userEvent.setup();
    renderTable([request()]);
    await user.click(screen.getByRole('button', { name: /^Signers for/ }));
    await user.click(screen.getByRole('button', { name: /Remind/i }));

    expect(remindMutate).toHaveBeenCalledWith(
      { submissionId: 7, signerId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
