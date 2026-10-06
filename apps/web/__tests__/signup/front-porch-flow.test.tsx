/**
 * Email-first signup UI (`components/signup/front-porch/signup-flow.tsx`).
 *
 * Pinned here: what each step refuses, what it sends, and that the trial step
 * — the only place answers reach the server — sends exactly the answers plus
 * Terms acceptance and nothing the session should decide (no email).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
}));

vi.mock('@/lib/actions/checkout', () => ({ createCheckoutSession: h.createCheckoutSessionMock }));
vi.mock('@/lib/stripe/browser', () => ({ getStripePromise: () => Promise.resolve({}) }));
vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children, options }: { children: React.ReactNode; options: { clientSecret: string } }) => (
    <div data-testid="checkout-provider" data-secret={options.clientSecret}>{children}</div>
  ),
  EmbeddedCheckout: () => <div>stripe-form</div>,
}));
// The address index is a static asset fetch; the flow is tested in manual mode.
vi.mock('@/lib/address-autocomplete', () => ({
  loadAddressAutocompleteSuggestions: vi.fn().mockResolvedValue([]),
  parseAddressAutocompleteQuery: () => null,
}));

import { SignupFlow } from '../../src/components/signup/front-porch/signup-flow';
import { sha256Hex } from '../../src/lib/auth/signup-binding';

const fetchMock = vi.fn();

/** Save a draft as the signed-in test user ('d@x.org') would have. */
function saveDraft(draft: Record<string, unknown>, owner = 'd@x.org') {
  window.localStorage.setItem('pp.signup.draft.v1', JSON.stringify({ ...draft, owner }));
}

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function setInput(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function clickNext(name: RegExp = /continue/i) {
  // The footer CTA; the type cards are buttons too, so match by name.
  fireEvent.click(screen.getAllByRole('button', { name })[0]!);
}

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'pp_signup_binding=; Max-Age=0; Path=/';
  fetchMock.mockReset();
  h.createCheckoutSessionMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('email step', () => {
  it('refuses a malformed email without calling the API', () => {
    render(<SignupFlow initialStep="email" sessionEmail={null} linkNotice={null} initialType={null} initialPlan={null} />);
    setInput('Email', 'nope');
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the link and shows the masked address', async () => {
    fetchMock.mockReturnValue(json(200, { data: { message: 'ok' } }));
    render(<SignupFlow initialStep="email" sessionEmail={null} linkNotice={null} initialType={null} initialPlan={null} />);
    setInput('Email', 'Dana@Sunset.org');
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText('d••••@sunset.org')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/signup/start', expect.objectContaining({ method: 'POST' }));
    // Resend is on cooldown right after a send.
    expect(screen.getByRole('button', { name: /resend in/i })).toBeDisabled();
  });

  it('binds the link to this browser, and a resend keeps the same binding', async () => {
    fetchMock.mockReturnValue(json(200, { data: { message: 'ok' } }));
    render(<SignupFlow initialStep="email" sessionEmail={null} linkNotice={null} initialType={null} initialPlan={null} />);
    setInput('Email', 'dana@sunset.org');
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
    await screen.findByRole('heading', { name: /check your email/i });

    const first = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body) as { binding: string };
    expect(first.binding).toMatch(/^[0-9a-f]{64}$/);
    const nonce = /pp_signup_binding=([0-9a-f]{64})/.exec(document.cookie)?.[1];
    expect(nonce).toBeDefined();
    // The link carries only the hash; the nonce never leaves this browser.
    expect(first.binding).toBe(await sha256Hex(nonce as string));

    fireEvent.click(screen.getByRole('button', { name: /^wrong email\? go back$/i }));
    setInput('Email', 'dana@sunset.org');
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
    await screen.findByRole('heading', { name: /check your email/i });
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, { body: string }])[1].body) as { binding: string };
    expect(second.binding).toBe(first.binding);
  });

  it('explains a link opened in a different browser', () => {
    render(<SignupFlow initialStep="email" sessionEmail={null} linkNotice="other-device" initialType={null} initialPlan={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/requested on a different device or browser/i);
  });

  it('says so when the emailed link failed', () => {
    render(<SignupFlow initialStep="email" sessionEmail={null} linkNotice="expired" initialType={null} initialPlan={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/i);
  });
});

describe('question steps', () => {
  it('requires a name and a community type', () => {
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    clickNext();
    expect(screen.getByText('Enter your community name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the type of community.')).toBeInTheDocument();
  });

  it('restores saved answers after the inbox detour', () => {
    saveDraft({ communityName: 'Bayview Towers', communityType: 'condo_718', step: 'place' });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    expect(screen.getByRole('heading', { name: /where is bayview towers/i })).toBeInTheDocument();
  });

  it('refuses a ZIP outside Florida', () => {
    saveDraft({
        communityName: 'Bayview Towers',
        communityType: 'condo_718',
        manualAddress: true,
        addressLine1: '1200 Brickell Bay Dr',
        city: 'Miami',
        zipCode: '10001',
        county: 'Miami-Dade',
        unitCount: '48',
        step: 'place',
      });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    clickNext();
    expect(screen.getByText(/enter a florida zip code/i)).toBeInTheDocument();
  });

  it('shows the statutory verdict at the threshold', () => {
    saveDraft({ communityName: 'Bayview', communityType: 'condo_718', unitCount: '25', step: 'place' });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    expect(screen.getByText('Website required')).toBeInTheDocument();
    setInput(/number of units/i, '24');
    expect(screen.getByText(/website optional at 24 units/i)).toBeInTheDocument();
  });

  it('will not leave "you" until the web address is confirmed available', async () => {
    fetchMock.mockReturnValue(json(200, { data: { available: false, reason: 'taken', message: 'taken' } }));
    saveDraft({ communityName: 'Bayview', communityType: 'condo_718', city: 'Miami', step: 'you' });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    setInput(/your name/i, 'Dana Reyes');
    expect(await screen.findByText('bayview.getpropertypro.com is taken.', {}, { timeout: 2000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /see what florida requires/i }));
    expect(screen.getByRole('heading', { name: /who's setting this up/i })).toBeInTheDocument();
    // The suggestion offers a free alternative built from the city.
    expect(screen.getByRole('button', { name: /use bayview-miami\.getpropertypro\.com/i })).toBeInTheDocument();
  });
});

describe('trial step', () => {
  const READY_DRAFT = {
    communityName: 'Bayview Towers',
    communityType: 'condo_718',
    manualAddress: true,
    addressLine1: '1200 Brickell Bay Dr',
    city: 'Miami',
    zipCode: '33131',
    county: 'Miami-Dade',
    unitCount: '48',
    primaryContactName: 'Dana Reyes',
    slug: 'bayview-towers',
    slugDirty: true,
    step: 'trial',
  };

  it('posts the answers with Terms acceptance, then mounts Stripe inline', async () => {
    saveDraft(READY_DRAFT);
    fetchMock.mockReturnValue(json(200, { data: { signupRequestId: 'req-1', subdomain: 'bayview-towers' } }));
    h.createCheckoutSessionMock.mockResolvedValue({ ok: true, clientSecret: 'cs_secret_1', sessionId: 'cs_1' });

    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    expect(screen.getByText(/by starting your trial, you agree/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start free trial/i }));
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/v1/auth/signup/details');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      communityName: 'Bayview Towers',
      communityType: 'condo_718',
      planKey: 'essentials',
      candidateSlug: 'bayview-towers',
      state: 'FL',
      unitCount: 48,
      termsAccepted: true,
    });
    expect(body).not.toHaveProperty('email');
    expect(h.createCheckoutSessionMock).toHaveBeenCalledWith('req-1');
    await waitFor(() => expect(screen.getByTestId('checkout-provider')).toHaveAttribute('data-secret', 'cs_secret_1'));
  });

  it('re-prices the open checkout when the plan changes', async () => {
    saveDraft(READY_DRAFT);
    fetchMock.mockReturnValue(json(200, { data: { signupRequestId: 'req-1', subdomain: 'bayview-towers' } }));
    h.createCheckoutSessionMock
      .mockResolvedValueOnce({ ok: true, clientSecret: 'cs_secret_1', sessionId: 'cs_1' })
      .mockResolvedValueOnce({ ok: true, clientSecret: 'cs_secret_2', sessionId: 'cs_2' });

    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start free trial/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /professional/i }));
    });

    await waitFor(() => expect(screen.getByTestId('checkout-provider')).toHaveAttribute('data-secret', 'cs_secret_2'));
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, { body: string }])[1].body) as Record<string, unknown>;
    expect(second.planKey).toBe('professional');
  });

  it('sends a rejected web address back to the "you" step', async () => {
    saveDraft(READY_DRAFT);
    fetchMock.mockReturnValueOnce(json(400, {
      error: { message: 'That subdomain is no longer available.', details: { field: 'candidateSlug' } },
    }));
    // The "you" step re-checks the slug on arrival.
    fetchMock.mockReturnValue(json(200, { data: { available: false, reason: 'taken', message: '' } }));

    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start free trial/i }));
    });

    expect(await screen.findByRole('heading', { name: /who's setting this up/i })).toBeInTheDocument();
    expect(h.createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('sends any refused field back to the step that can fix it', async () => {
    saveDraft(READY_DRAFT);
    fetchMock.mockReturnValueOnce(json(400, {
      error: { message: 'Invalid signup payload', details: { fieldErrors: { county: ['County is required'] } } },
    }));
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start free trial/i }));
    });
    expect(await screen.findByRole('heading', { name: /where is bayview towers/i })).toBeInTheDocument();
    expect(screen.getByText('County is required')).toBeInTheDocument();
  });

  it('offers a fresh sign-in link when the session lapsed, keeping the answers', async () => {
    saveDraft(READY_DRAFT);
    fetchMock.mockReturnValueOnce(json(401, { error: { message: 'Unauthorized' } }));
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start free trial/i }));
    });
    expect(screen.getByRole('link', { name: /get a new sign-in link/i })).toHaveAttribute('href', '/signup');
    expect(JSON.parse(window.localStorage.getItem('pp.signup.draft.v1') ?? '{}')).toMatchObject({ communityName: 'Bayview Towers' });
  });
});

describe('review fixes', () => {
  it('excludes the signup\'s own saved row when re-checking its web address', async () => {
    fetchMock.mockReturnValue(json(200, { data: { normalizedSubdomain: 'bayview', available: true, reason: 'available', message: '' } }));
    saveDraft({ communityName: 'Bayview', communityType: 'condo_718', signupRequestId: 'req-own', step: 'you' });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 2000 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('signupRequestId=req-own');
  });

  it('does not restore a draft another account wrote on this device', () => {
    saveDraft({ communityName: 'Someone Else HOA', communityType: 'hoa_720', step: 'place' }, 'other@x.org');
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    expect(screen.getByRole('heading', { name: /what's your community called/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Someone Else HOA')).toBeNull();
  });

  it('shows who is signed in, with a way to switch', () => {
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    expect(screen.getByText('d@x.org')).toBeVisible();
    expect(screen.getByRole('button', { name: /use a different email/i })).toBeInTheDocument();
  });

  it('never suggests the taken address itself, even at the 63-character limit', async () => {
    const long = 'a'.repeat(63);
    fetchMock.mockReturnValue(json(200, { data: { normalizedSubdomain: long, available: false, reason: 'taken', message: '' } }));
    saveDraft({ communityName: long, communityType: 'condo_718', city: 'Miami', step: 'you' });
    render(<SignupFlow initialStep="type" sessionEmail="d@x.org" linkNotice={null} initialType={null} initialPlan={null} />);
    const suggestion = await screen.findByRole('button', { name: /^use /i }, { timeout: 2000 });
    expect(suggestion.textContent).toContain('-miami');
    expect(suggestion.textContent).not.toBe(`Use ${long}.getpropertypro.com`);
  });
});
