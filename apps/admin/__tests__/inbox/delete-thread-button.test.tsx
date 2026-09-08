// @vitest-environment jsdom
/**
 * The 404 path, which had no test and needed one.
 *
 * `logAdminAction` throws only AFTER the row is destroyed, and its own message
 * says so — but it is a plain Error, so `withAdminErrorHandler` flattens it to a
 * generic 500 and the text never reaches the client. The first version of this
 * component showed "please try again" for every non-ok response, which meant:
 * the thread was gone, the operator was told it had failed, they clicked again,
 * the route returned 404, and the same sentence appeared forever. A second admin
 * deleting the same thread hit it with no audit failure at all.
 *
 * A 404 here means the conversation is not there, which is what was asked for.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const { DeleteThreadButton } = await import('@/components/inbox/DeleteThreadButton');

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<DeleteThreadButton threadId={42} participantEmail="jane@example.com" />);
  });
}

function clickByText(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!button) throw new Error(`no button labelled "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('DeleteThreadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mount();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('treats a 404 as done, not as a failure to retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    clickByText('Delete conversation');
    await act(async () => {
      clickByText('Delete');
    });

    expect(pushMock).toHaveBeenCalledWith('/inbox');
    expect(container.textContent).not.toContain('try again');
  });

  it('navigates away on success (control)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    clickByText('Delete conversation');
    await act(async () => {
      clickByText('Delete');
    });

    expect(pushMock).toHaveBeenCalledWith('/inbox');
  });

  it('does not advise a retry on a 500 — the row may already be gone', async () => {
    // The compound case: delete committed, audit write threw. Retrying is the
    // one thing that cannot help, and it is what the old copy advised.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    clickByText('Delete conversation');
    await act(async () => {
      clickByText('Delete');
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('may already be deleted');
    expect(container.textContent).not.toContain('Please try again');
  });

  it('does advise a retry when the request never reached the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    clickByText('Delete conversation');
    await act(async () => {
      clickByText('Delete');
    });

    expect(container.textContent).toContain('Please try again');
  });
});
