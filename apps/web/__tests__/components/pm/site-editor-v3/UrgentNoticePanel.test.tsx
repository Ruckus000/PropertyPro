/**
 * Website editor v3, Phase 7 — the urgent notice panel and its form.
 *
 * §2.4 requires a component test covering keyboard operation for any new
 * interactive surface. This surface earns more than that: it is the control
 * that puts text on a public page with no review step, so the tests below also
 * pin the refusal when the site has never been published, and the undo window
 * on removal.
 *
 * The hooks are mocked at the module boundary rather than the fetch boundary so
 * the assertions read as "what did the panel ask the server to do".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  useUrgentNoticeMock,
  setMutateMock,
  clearMutateMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  useUrgentNoticeMock: vi.fn(),
  setMutateMock: vi.fn(),
  clearMutateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

// Mocked COMPLETELY — a partial factory fails at module load for whichever
// component reaches the missing export, and it reads as an unrelated component
// breaking rather than as a bad mock.
vi.mock('@/hooks/use-urgent-notice', () => ({
  useUrgentNotice: useUrgentNoticeMock,
  useSetUrgentNotice: () => ({ mutate: setMutateMock, isPending: false }),
  useClearUrgentNotice: () => ({ mutate: clearMutateMock, isPending: false }),
  urgentNoticeQueryKey: (communityId: number) =>
    ['pm', 'site', 'urgent-notice', communityId] as const,
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { UrgentNoticePanel } from '@/components/pm/site-editor-v3/panels/UrgentNoticePanel';

const COMMUNITY_ID = 42;

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof UrgentNoticePanel>> = {},
) {
  return render(
    <UrgentNoticePanel
      communityId={COMMUNITY_ID}
      hasPublishedSite
      initialNotice={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUrgentNoticeMock.mockReturnValue({ data: null });
});

afterEach(cleanup);

describe('UrgentNoticePanel — the unpublished-site refusal', () => {
  it('explains why a notice cannot be posted yet and offers no form', () => {
    renderPanel({ hasPublishedSite: false });

    expect(screen.getByTestId('urgent-notice-unavailable')).toBeInTheDocument();
    expect(screen.getByText('Publish your website first')).toBeInTheDocument();
    // No textarea at all, rather than a disabled one — there is nothing to type
    // into productively until the site exists.
    expect(screen.queryByLabelText(/notice text/i)).not.toBeInTheDocument();
  });
});

describe('UrgentNoticePanel — posting', () => {
  it('is fully operable by keyboard, from tab focus to submit', async () => {
    const user = userEvent.setup();
    renderPanel();

    const textarea = screen.getByLabelText('Notice text');
    // Reach the field by keyboard, type into it, then submit by keyboard —
    // never by clicking.
    textarea.focus();
    await user.keyboard('Pool closed through Friday');
    await user.tab(); // → expiry input
    expect(screen.getByLabelText(/take it down automatically/i)).toHaveFocus();
    await user.tab(); // → submit button
    expect(screen.getByRole('button', { name: 'Post notice' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(setMutateMock).toHaveBeenCalledWith(
        { text: 'Pool closed through Friday', expiresAt: null },
        expect.anything(),
      );
    });
  });

  it('shows a live character counter that counts down', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText('240 characters left')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Notice text'), 'Pool closed');
    expect(screen.getByText('229 characters left')).toBeInTheDocument();
  });

  it('trims the text before sending it', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Notice text'), '   Boil water   ');
    await user.click(screen.getByRole('button', { name: 'Post notice' }));

    expect(setMutateMock).toHaveBeenCalledWith(
      { text: 'Boil water', expiresAt: null },
      expect.anything(),
    );
  });

  it('keeps the submit button disabled while the field is empty', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole('button', { name: 'Post notice' })).toBeDisabled();
    await user.type(screen.getByLabelText('Notice text'), 'x');
    expect(screen.getByRole('button', { name: 'Post notice' })).toBeEnabled();
  });

  it('refuses an expiry in the past without calling the server', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Notice text'), 'Pool closed');
    await user.type(
      screen.getByLabelText(/take it down automatically/i),
      '2020-01-01T09:00',
    );
    await user.click(screen.getByRole('button', { name: 'Post notice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /end time needs to be in the future/i,
    );
    expect(setMutateMock).not.toHaveBeenCalled();
  });

  it('surfaces the server message when the write is refused', async () => {
    const user = userEvent.setup();
    setMutateMock.mockImplementation((_vars, opts) => {
      opts.onError(new Error('Publish your website before posting an urgent notice'));
    });
    renderPanel();

    await user.type(screen.getByLabelText('Notice text'), 'Pool closed');
    await user.click(screen.getByRole('button', { name: 'Post notice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /publish your website before posting/i,
    );
  });

  it('warns that notices skip the publish step, before the button is pressed', () => {
    renderPanel();
    expect(screen.getByText(/go live immediately/i)).toBeInTheDocument();
  });
});

describe('UrgentNoticePanel — an existing notice', () => {
  const LIVE = {
    text: 'Boil water order in effect',
    expiresAt: null,
    setAt: '2026-07-27T12:00:00.000Z',
  };

  beforeEach(() => {
    useUrgentNoticeMock.mockReturnValue({ data: LIVE });
  });

  it('shows the live notice as TEXT, never as markup', () => {
    useUrgentNoticeMock.mockReturnValue({
      data: { ...LIVE, text: '<script>alert(1)</script>' },
    });
    const { container } = renderPanel();

    // Scoped to the live-notice card: the payload also appears as the
    // pre-filled textarea value, which is a second legitimate match.
    const current = screen.getByTestId('urgent-notice-current');
    expect(within(current).getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('labels a live notice as live and offers removal', () => {
    renderPanel();
    expect(screen.getByText('Live on your website now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove notice' })).toBeInTheDocument();
  });

  it('labels an expired notice as expired rather than hiding it', () => {
    // The public site stopped showing it; the manager still needs to see that
    // they posted it and that it came down.
    useUrgentNoticeMock.mockReturnValue({
      data: { ...LIVE, expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });
    renderPanel();

    expect(screen.getByText(/expired — no longer showing/i)).toBeInTheDocument();
  });

  it('switches the submit action to "Replace notice"', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Replace notice' })).toBeInTheDocument();
  });

  it('pre-fills the textarea with the current text so a tweak is one edit', () => {
    renderPanel();
    expect(screen.getByLabelText(/replace the notice/i)).toHaveValue(LIVE.text);
  });
});

describe('UrgentNoticePanel — removal', () => {
  const LIVE = { text: 'Pool closed', expiresAt: null, setAt: null };

  beforeEach(() => {
    useUrgentNoticeMock.mockReturnValue({ data: LIVE });
  });

  it('confirms before removing, and removes nothing if cancelled', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Remove notice' }));
    expect(
      await screen.findByRole('heading', { name: /remove the urgent notice\?/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(clearMutateMock).not.toHaveBeenCalled();
  });

  it('removes on confirmation and offers Undo inside the toast window', async () => {
    const user = userEvent.setup();
    clearMutateMock.mockImplementation((_vars, opts) => opts.onSuccess());
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Remove notice' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = await within(dialog).findByRole('button', { name: 'Remove notice' });
    await user.click(confirm);

    expect(clearMutateMock).toHaveBeenCalled();
    // The Undo affordance is what makes this removal recoverable — the server
    // has no un-clear endpoint, so the toast action is the only path back.
    const [message, options] = toastSuccessMock.mock.calls[0]!;
    expect(message).toMatch(/removed from your website/i);
    expect(options.action.label).toBe('Undo');
    expect(options.duration).toBe(10_000);
  });

  it('clears the textarea once the notice is gone, so a stray click cannot re-publish it', async () => {
    // Regression: the fields were initialised once and never resynced, so after
    // a removal the textarea still held the text that had just been taken down
    // AND the button read "Post notice" and was enabled. One click put it back
    // on every public page.
    const user = userEvent.setup();
    clearMutateMock.mockImplementation((_vars, opts) => {
      opts.onSuccess();
      // The mutation's onSuccess writes null into the cache; model that.
      useUrgentNoticeMock.mockReturnValue({ data: null });
    });
    const { rerender } = renderPanel();

    expect(screen.getByLabelText(/replace the notice/i)).toHaveValue('Pool closed');

    await user.click(screen.getByRole('button', { name: 'Remove notice' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove notice' }));

    rerender(
      <UrgentNoticePanel communityId={COMMUNITY_ID} hasPublishedSite initialNotice={null} />,
    );

    expect(screen.getByLabelText('Notice text')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Post notice' })).toBeDisabled();
  });

  it('moves focus to the textarea after removal, keeping the Undo toast reachable', async () => {
    // The Remove button lives inside the card that unmounts, so restoring focus
    // to it drops focus on <body> — and the Undo action is the only way back.
    const user = userEvent.setup();
    clearMutateMock.mockImplementation((_vars, opts) => {
      opts.onSuccess();
      useUrgentNoticeMock.mockReturnValue({ data: null });
    });
    const { rerender } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Remove notice' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove notice' }));

    rerender(
      <UrgentNoticePanel communityId={COMMUNITY_ID} hasPublishedSite initialNotice={null} />,
    );

    await waitFor(() => expect(screen.getByLabelText('Notice text')).toHaveFocus());
  });

  it('returns focus to the Remove button when the dialog closes', async () => {
    // Radix restores focus to a registered trigger. ConfirmDialog is code-split
    // and has none, so without the explicit `restoreFocusTo` handoff focus would
    // land on <body> and strand a keyboard user.
    const user = userEvent.setup();
    renderPanel();

    const removeButton = screen.getByRole('button', { name: 'Remove notice' });
    await user.click(removeButton);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(removeButton).toHaveFocus());
  });
});
