/**
 * EsignPageShell — three readings of one set, one at a time.
 *
 * Before: a tab strip holding ONE real tab plus a `<Link>` styled to look like
 * a second, above a four-column table with no signer data and no actions.
 * Per the design prototype (`pp-esign.js`) the screen becomes Requests /
 * Waiting on / Templates, URL-backed, with rows that can act on themselves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EsignRequest, EsignRequestSigner } from '@/lib/esign/submission-status';

const routerReplace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => '/esign',
  useSearchParams: () => search,
}));

const refetch = vi.fn();
let requests: EsignRequest[] = [];
let listState = { isLoading: false, isError: false };

vi.mock('@/hooks/use-esign-submissions', () => ({
  useEsignSubmissions: () => ({
    data: requests,
    isLoading: listState.isLoading,
    isError: listState.isError,
    refetch,
  }),
  useSendEsignReminder: () => ({ mutate: vi.fn(), isPending: false }),
}));

const templatesViewSpy = vi.fn();
vi.mock('@/components/esign/templates-view', () => ({
  TemplatesView: () => {
    templatesViewSpy();
    return <div>Templates view</div>;
  },
}));

import { EsignPageShell } from '@/components/esign/esign-page-shell';

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
    id: 10,
    externalId: 'sub-ext-10',
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

function renderShell(viewer = { id: 'user-manager', email: 'cam@sunset.local' }) {
  return render(
    <EsignPageShell
      communityId={3}
      viewerUserId={viewer.id}
      viewerEmail={viewer.email}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams('communityId=3');
  requests = [request()];
  listState = { isLoading: false, isError: false };
});

describe('the view switcher', () => {
  it('offers exactly the three readings', () => {
    renderShell();
    expect(screen.getByRole('tab', { name: /Requests/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Waiting on/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Templates/ })).toBeDefined();
  });

  it('opens on Requests, and treats anything unknown as Requests', () => {
    search = new URLSearchParams('communityId=3&view=zzz');
    const { unmount } = renderShell();
    expect(screen.getByRole('tab', { name: /Requests/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    unmount();

    // `documents` was the old single tab's value — an old link must still land.
    search = new URLSearchParams('communityId=3&view=documents');
    renderShell();
    expect(screen.getByRole('tab', { name: /Requests/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('writes the view with replace, keeping communityId', async () => {
    // `push` would make Back walk every view the user glanced at instead of
    // leaving the page.
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('tab', { name: /Templates/ }));

    // Radix activates a tab on focus as well as click (`activationMode`
    // defaults to automatic), so one click fires onValueChange twice. Both
    // carry the same value and `replace` is idempotent, so this asserts the
    // navigation rather than the call count — same behaviour the meetings
    // screen has shipped with.
    expect(routerReplace).toHaveBeenCalled();
    const [url, opts] = routerReplace.mock.calls.at(-1)!;
    expect(url).toContain('view=templates');
    expect(url).toContain('communityId=3');
    expect(opts).toEqual({ scroll: false });
  });

  it('mounts only the active view', () => {
    search = new URLSearchParams('communityId=3&view=templates');
    renderShell();

    expect(templatesViewSpy).toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Signature requests' })).toBeNull();
  });
});

describe('the primary action', () => {
  it('is a LINK, and follows the view', () => {
    // The e2e spec clicks `getByRole('link', { name: /Send Document/i })` from
    // this screen; a button with an onClick would break it.
    const { unmount } = renderShell();
    expect(screen.getByRole('link', { name: /Send Document/i })).toHaveAttribute(
      'href',
      '/esign/submissions/new?communityId=3',
    );
    unmount();

    search = new URLSearchParams('communityId=3&view=templates');
    renderShell();
    expect(screen.getByRole('link', { name: /New Template/i })).toHaveAttribute(
      'href',
      '/esign/templates/new?communityId=3',
    );
    expect(screen.queryByRole('link', { name: /Send Document/i })).toBeNull();
  });
});

describe('the Waiting-on count', () => {
  it('counts outstanding signers and names what it counts', () => {
    requests = [
      request({ id: 1, signers: [signer({ id: 11 }), signer({ id: 12, sortOrder: 1 })] }),
    ];
    renderShell();

    const tab = screen.getByRole('tab', { name: /Waiting on/ });
    expect(tab.textContent).toContain('2');
    // A bare number beside a label reads as ambiguous without this.
    expect(tab.textContent).toContain('outstanding');
  });

  it('shows nothing at zero rather than a 0', () => {
    requests = [request({ effectiveStatus: 'completed', signers: [signer({ status: 'completed' })] })];
    renderShell();

    expect(screen.getByRole('tab', { name: 'Waiting on' })).toBeDefined();
  });
});

describe('cross-view context', () => {
  it('shows the urgent strip only inside the window', () => {
    requests = [request({ expiresAt: new Date(Date.now() + 3 * DAY).toISOString() })];
    const { unmount } = renderShell();
    expect(screen.getByRole('region', { name: 'Most urgent request' })).toBeDefined();
    unmount();

    requests = [request({ expiresAt: new Date(Date.now() + 30 * DAY).toISOString() })];
    renderShell();
    expect(screen.queryByRole('region', { name: 'Most urgent request' })).toBeNull();
  });

  it('suppresses the urgent strip when the panel already names that request', () => {
    // The likeliest case for a manager who is also a signer: the request they
    // are chasing is their own. Without this the same title prints twice, one
    // card directly above the other.
    requests = [
      request({
        expiresAt: new Date(Date.now() + 2 * DAY).toISOString(),
        signers: [signer({ userId: 'user-manager' })],
      }),
    ];
    renderShell();

    expect(screen.getByRole('region', { name: 'Awaiting your signature' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Most urgent request' })).toBeNull();
  });

  it('shows the awaiting panel only to a viewer who is themselves a signer', () => {
    requests = [request({ signers: [signer({ email: 'someone.else@test.com' })] })];
    renderShell();

    expect(screen.queryByRole('region', { name: 'Awaiting your signature' })).toBeNull();
  });

  it('matches the viewer by email when the signer has no user id', () => {
    requests = [request({ signers: [signer({ userId: null, email: 'CAM@Sunset.local' })] })];
    renderShell();

    expect(screen.getByRole('region', { name: 'Awaiting your signature' })).toBeDefined();
  });
});

describe('states', () => {
  it('offers a retry that refetches when the list fails', async () => {
    const user = userEvent.setup();
    listState = { isLoading: false, isError: true };
    renderShell();

    expect(screen.getByRole('alert')).toBeDefined();
    await user.click(screen.getByRole('button', { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers a way out of an empty screen', () => {
    requests = [];
    renderShell();

    expect(screen.getByText(/Send your first document for signature/i)).toBeDefined();
  });
});
