/**
 * CommunityProfileCard, driven through its real hooks with `fetch` as the only
 * fake: what the person sees, and exactly which requests a Save sends.
 *
 * The fake server below answers the three routes the card talks to
 * (`GET`/`PATCH /api/v1/community/profile`, `PATCH /api/v1/community/unit-count`)
 * and keeps what was last saved, so a test can also see the card follow the
 * server after a save. A test makes a route fail by replacing its handler.
 * The router is faked too: the card refreshes the page after a rename.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommunityType } from '@propertypro/shared';
import type { CommunityProfilePayload } from '@/app/api/v1/community/profile/contract';

const { toastSuccess, refreshMock } = vi.hoisted(() => ({ toastSuccess: vi.fn(), refreshMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { CommunityProfileCard } from '@/components/settings/community-profile-card';

const COMMUNITY_ID = 42;
const PROFILE_PATH = '/api/v1/community/profile';
const COUNT_PATH = '/api/v1/community/unit-count';

const SAVED: CommunityProfilePayload = {
  name: 'Sunset Condominium Association',
  shortName: 'Sunset Condos',
  addressLine1: '123 Ocean Drive',
  addressLine2: 'Suite 4',
  city: 'Miami Beach',
  state: 'FL',
  zipCode: '33139',
  unitCount: 40,
  officeHours: 'Monday to Friday, 9am to 5pm',
  contactName: 'Dana Rivera',
  contactEmail: 'office@sunsetcondos.example',
  contactPhone: '(305) 555-0100',
};

// ── The fake server ─────────────────────────────────────────────────────────

interface Sent {
  method: string;
  path: string;
  search: string;
  body: Record<string, unknown> | undefined;
}
interface Reply {
  status: number;
  json: unknown;
}
type Handler = (body: Record<string, unknown> | undefined) => Reply | Promise<Reply>;

let stored: CommunityProfilePayload;
let sent: Sent[];
let handlers: Record<string, Handler>;

function ok(data: unknown): Reply {
  return { status: 200, json: { data } };
}

function refuse(status: number, code: string, message: string, details?: unknown): Reply {
  return { status, json: { error: { code, message, ...(details === undefined ? {} : { details }) } } };
}

const FAIL_500 = () => refuse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');

function serverHandlers(): Record<string, Handler> {
  return {
    [`GET ${PROFILE_PATH}`]: () => ok(stored),
    [`PATCH ${PROFILE_PATH}`]: (body) => {
      const { communityId: _communityId, ...changes } = body ?? {};
      stored = { ...stored, ...changes } as CommunityProfilePayload;
      return ok(stored);
    },
    [`PATCH ${COUNT_PATH}`]: (body) => {
      stored = { ...stored, unitCount: body?.['unitCount'] as number };
      return ok({ unitCount: stored.unitCount });
    },
  };
}

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), 'http://localhost');
  const method = init?.method ?? 'GET';
  const body =
    typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  sent.push({ method, path: url.pathname, search: url.search, body });

  const handler = handlers[`${method} ${url.pathname}`];
  if (!handler) throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  const reply = await handler(body);
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.json };
});

beforeEach(() => {
  stored = { ...SAVED };
  sent = [];
  handlers = serverHandlers();
  toastSuccess.mockClear();
  refreshMock.mockClear();
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

interface RenderOptions {
  communityType?: CommunityType;
  /** Fill the query cache before the card mounts. */
  seed?: (client: QueryClient) => void;
  /**
   * `instant` (the default): a failing read is retried as the app retries it, but
   * without the wait. `library`: TanStack Query's own defaults, backoff included,
   * which is what production runs, for a test about how long a failure takes to show.
   */
  retries?: 'instant' | 'library';
}

function renderCard({ communityType = 'condo_718', seed, retries = 'instant' }: RenderOptions = {}) {
  const client =
    retries === 'library'
      ? new QueryClient()
      : new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  seed?.(client);
  const user = userEvent.setup();
  const tree = (communityId: number) => (
    <QueryClientProvider client={client}>
      <CommunityProfileCard communityId={communityId} communityType={communityType} />
    </QueryClientProvider>
  );
  const view = render(tree(COMMUNITY_ID));
  return {
    client,
    user,
    switchCommunity: (communityId: number) => view.rerender(tree(communityId)),
  };
}

/** The card once its profile has loaded. */
async function loaded(options?: RenderOptions) {
  const view = renderCard(options);
  await screen.findByLabelText('Community name');
  return view;
}

const patchesTo = (path: string) => sent.filter((request) => request.method === 'PATCH' && request.path === path);
const saveButton = () => screen.getByRole('button', { name: 'Save profile' });

async function replaceText(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const box = screen.getByLabelText(label);
  await user.clear(box);
  if (text !== '') await user.type(box, text);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CommunityProfileCard', () => {
  it('shows saved values', async () => {
    await loaded();

    expect(screen.getByLabelText('Community name')).toHaveValue(SAVED.name);
    expect(screen.getByLabelText('Short name')).toHaveValue(SAVED.shortName);
    expect(screen.getByLabelText('Street address')).toHaveValue(SAVED.addressLine1);
    expect(screen.getByLabelText('Address line 2')).toHaveValue(SAVED.addressLine2);
    expect(screen.getByLabelText('City')).toHaveValue(SAVED.city);
    expect(screen.getByLabelText('State')).toHaveValue(SAVED.state);
    expect(screen.getByLabelText('ZIP code')).toHaveValue(SAVED.zipCode);
    expect(screen.getByLabelText('Number of units')).toHaveValue(40);
    expect(screen.getByLabelText('Contact name')).toHaveValue(SAVED.contactName);
    expect(screen.getByLabelText('Contact email')).toHaveValue(SAVED.contactEmail);
    expect(screen.getByLabelText('Contact phone')).toHaveValue(SAVED.contactPhone);
    expect(screen.getByLabelText('Office hours')).toHaveValue(SAVED.officeHours);
    // The name is the one box that cannot be left empty.
    expect(screen.getByLabelText('Community name')).toBeRequired();
    expect(screen.getByLabelText('Short name')).not.toBeRequired();
    // Nothing to save yet.
    expect(saveButton()).toBeDisabled();
  });

  it('asks the server for this community and caches the answer under its query key', async () => {
    const { client } = await loaded();

    const read = sent.find((request) => request.method === 'GET');
    expect(read?.path).toBe(PROFILE_PATH);
    expect(read?.search).toBe(`?communityId=${COMMUNITY_ID}`);
    expect(client.getQueryData(['community-profile', COMMUNITY_ID])).toEqual(SAVED);
  });

  it('says what each group of fields is for', async () => {
    await loaded();

    for (const title of ['Name', 'Address', 'Shown on your website']) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    }
    expect(
      screen.getByText('Used on your website instead of the full name. Leave blank to use the full name.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Shown in the Contact section of your website.')).toBeInTheDocument();
    // The blank-hides promise belongs to the contact group alone: the Contact
    // section always shows the address.
    expect(screen.getAllByText('Leave a field blank to hide it on your website.')).toHaveLength(1);
    expect(screen.getByText('Changes show on your website right away.')).toBeInTheDocument();
  });

  it('names each group and ties its description to the boxes inside it', async () => {
    await loaded();

    const name = screen.getByRole('group', { name: 'Name' });
    const address = screen.getByRole('group', { name: 'Address' });
    const contact = screen.getByRole('group', { name: 'Shown on your website' });

    expect(address).toHaveAccessibleDescription('Shown in the Contact section of your website.');
    expect(contact).toHaveAccessibleDescription('Leave a field blank to hide it on your website.');
    // The title says all there is to say about the name group.
    expect(name).not.toHaveAccessibleDescription();

    for (const label of ['Community name', 'Short name']) {
      expect(within(name).getByLabelText(label)).toBeInTheDocument();
    }
    for (const label of ['Street address', 'Address line 2', 'City', 'State', 'ZIP code']) {
      expect(within(address).getByLabelText(label)).toBeInTheDocument();
    }
    for (const label of ['Contact name', 'Contact email', 'Contact phone', 'Office hours']) {
      expect(within(contact).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('describes a box by its help text', async () => {
    await loaded();

    expect(screen.getByLabelText('Short name')).toHaveAccessibleDescription(
      'Used on your website instead of the full name. Leave blank to use the full name.',
    );
  });

  it('sends only changed fields', async () => {
    const { user } = await loaded();

    await replaceText(user, 'City', 'Surfside');
    await replaceText(user, 'Office hours', 'Weekdays 10am to 2pm');
    await user.click(saveButton());

    await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
    // Exactly the two edits and the community: no untouched field, and never unitCount.
    expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      city: 'Surfside',
      officeHours: 'Weekdays 10am to 2pm',
    });
    expect(patchesTo(COUNT_PATH)).toHaveLength(0);
  });

  it('sends null for a cleared field', async () => {
    const { user } = await loaded();

    await replaceText(user, 'Short name', '');
    await replaceText(user, 'Contact phone', '');
    await user.click(saveButton());

    await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
    expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      shortName: null,
      contactPhone: null,
    });
  });

  it('sends a renamed community trimmed', async () => {
    const { user } = await loaded();

    await replaceText(user, 'Community name', '  Sunset Condominiums  ');
    await user.click(saveButton());

    await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
    expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      name: 'Sunset Condominiums',
    });
  });

  it('treats a field holding only spaces as cleared, and trims what it sends', async () => {
    const { user } = await loaded();

    await replaceText(user, 'Address line 2', '   ');
    await replaceText(user, 'City', '  Surfside  ');
    await user.click(saveButton());

    await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
    expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      addressLine2: null,
      city: 'Surfside',
    });
  });

  it('capitalizes the state before sending it', async () => {
    const { user } = await loaded();

    await replaceText(user, 'State', 'ga');
    expect(screen.getByLabelText('State')).toHaveValue('GA');
    await user.click(saveButton());

    await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
    expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({ communityId: COMMUNITY_ID, state: 'GA' });
  });

  it('keeps Save off until something differs from what is saved', async () => {
    const { user } = await loaded();

    await replaceText(user, 'City', 'Surfside');
    expect(saveButton()).toBeEnabled();

    // Back to what is saved, and a trailing space that trims away.
    await replaceText(user, 'City', 'Miami Beach ');
    expect(saveButton()).toBeDisabled();

    // The same goes for a count typed over again.
    await replaceText(user, 'Number of units', '41');
    expect(saveButton()).toBeEnabled();
    await replaceText(user, 'Number of units', '40');
    expect(saveButton()).toBeDisabled();
  });

  it('shows the new values and confirms after a save', async () => {
    const { user } = await loaded();

    await replaceText(user, 'City', '  Surfside  ');
    await user.click(saveButton());

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Community profile saved.'));
    // The box follows what the server now holds, not what was typed.
    expect(screen.getByLabelText('City')).toHaveValue('Surfside');
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a blank name without sending anything', async () => {
    const { user } = await loaded();

    await replaceText(user, 'Community name', '   ');
    await user.click(saveButton());

    const message = await screen.findByText('Enter your community’s name.');
    const box = screen.getByLabelText('Community name');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Enter your community’s name.');
    expect(box).toHaveFocus();
    expect(patchesTo(PROFILE_PATH)).toHaveLength(0);

    // Typing a name takes the message away.
    await user.type(box, 'Sunset');
    expect(message).not.toBeInTheDocument();
    expect(box).not.toHaveAttribute('aria-invalid');
  });

  it('shows the danger AlertBanner when saving fails', async () => {
    handlers[`PATCH ${PROFILE_PATH}`] = FAIL_500;
    const { user } = await loaded();

    await replaceText(user, 'City', 'Surfside');
    await user.click(saveButton());

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("We couldn't save your changes. Please try again.");
    // The danger variant of AlertBanner.
    expect(banner).toHaveClass('text-status-danger');
    // Nothing but the title: the server's "unexpected error" is not for the reader, and nothing else was saved.
    expect(banner.textContent).toBe("We couldn't save your changes. Please try again.");
    expect(toastSuccess).not.toHaveBeenCalled();
    // The edit is still there and can be sent again.
    expect(screen.getByLabelText('City')).toHaveValue('Surfside');
    expect(saveButton()).toBeEnabled();
  });

  it('passes on the reason when the server refuses a value', async () => {
    handlers[`PATCH ${PROFILE_PATH}`] = () =>
      refuse(400, 'VALIDATION_ERROR', 'Invalid request body', {
        fields: [
          { field: 'zipCode', message: 'Use a 5-digit ZIP code, like 33139, or ZIP+4, like 33139-1234.' },
        ],
      });
    const { user } = await loaded();

    await replaceText(user, 'ZIP code', '3313');
    await user.click(saveButton());

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("We couldn't save your changes. Please try again.");
    expect(banner).toHaveTextContent('Use a 5-digit ZIP code, like 33139, or ZIP+4, like 33139-1234.');
  });

  it('passes on a refusal that is not about a value', async () => {
    // A demo past its trial: nothing the person types will change the answer.
    handlers[`PATCH ${PROFILE_PATH}`] = () =>
      refuse(403, 'DEMO_GRACE_READ_ONLY', 'Your trial has ended. Subscribe to regain full access.');
    const { user } = await loaded();

    await replaceText(user, 'City', 'Surfside');
    await user.click(saveButton());

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("We couldn't save your changes. Please try again.");
    expect(banner).toHaveTextContent('Your trial has ended. Subscribe to regain full access.');
  });

  it('sends once, and locks the boxes, while a save is in flight', async () => {
    let finish: (reply: Reply) => void = () => {};
    handlers[`PATCH ${PROFILE_PATH}`] = () => new Promise<Reply>((resolve) => (finish = resolve));
    const { user } = await loaded();

    await replaceText(user, 'City', 'Surfside');
    await user.click(saveButton());
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    expect(screen.getByLabelText('City')).toHaveAttribute('readonly');

    // Another click, and a submit that does not go through the button (Enter in a box).
    await user.click(saving);
    fireEvent.submit(saving.closest('form')!);
    expect(patchesTo(PROFILE_PATH)).toHaveLength(1);

    finish(ok({ ...stored, city: 'Surfside' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(patchesTo(PROFILE_PATH)).toHaveLength(1);
    expect(screen.getByLabelText('City')).not.toHaveAttribute('readonly');
  });

  it('does not carry edits over to another community', async () => {
    const { client, user, switchCommunity } = await loaded();
    // The other community is already cached, so the card does not pass through its loading state.
    client.setQueryData(['community-profile', 43], { ...SAVED, name: 'Palm Shores HOA', city: 'Orlando' });

    await replaceText(user, 'City', 'Surfside');
    switchCommunity(43);

    expect(await screen.findByDisplayValue('Palm Shores HOA')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toHaveValue('Orlando');
    expect(saveButton()).toBeDisabled();
  });

  describe('the rest of the page', () => {
    it('refreshes it after a rename, so the sidebar shows the new name', async () => {
      const { user } = await loaded();

      await replaceText(user, 'Community name', 'Sunset Condominiums');
      expect(refreshMock).not.toHaveBeenCalled();
      await user.click(saveButton());

      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
      expect(patchesTo(PROFILE_PATH)).toHaveLength(1);
    });

    it('leaves it alone when the name did not change', async () => {
      const { user } = await loaded();

      await replaceText(user, 'City', 'Surfside');
      await user.click(saveButton());

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it('leaves it alone when the rename did not save', async () => {
      handlers[`PATCH ${PROFILE_PATH}`] = FAIL_500;
      const { user } = await loaded();

      await replaceText(user, 'Community name', 'Sunset Condominiums');
      await user.click(saveButton());

      await screen.findByRole('alert');
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe('unit count', () => {
    const FOR_CONDO = 'Florida law (§718.111(12)(g)) applies to associations of 25 or more units.';
    const FOR_HOA = 'Florida law (§720.303) applies to associations of 100 or more parcels.';

    it.each<[string, CommunityType, number | null, string, string]>([
      ['a condo at or above the threshold', 'condo_718', 40, 'Number of units', `${FOR_CONDO} Yours has 40.`],
      [
        'a condo whose count is not known',
        'condo_718',
        null,
        'Number of units',
        `${FOR_CONDO} Until you add your count, we treat its website rules as applying.`,
      ],
      [
        'a condo below the threshold',
        'condo_718',
        10,
        'Number of units',
        `${FOR_CONDO} Yours has 10, so its website list is a recommendation.`,
      ],
      ['an HOA at or above the threshold', 'hoa_720', 150, 'Number of parcels', `${FOR_HOA} Yours has 150.`],
      [
        'an HOA below the threshold',
        'hoa_720',
        60,
        'Number of parcels',
        `${FOR_HOA} Yours has 60, so its website list is a recommendation.`,
      ],
    ])('explains the rule for %s', async (_case, communityType, unitCount, label, line) => {
      stored = { ...SAVED, unitCount };
      await loaded({ communityType });

      expect(screen.getByLabelText(label)).toHaveValue(unitCount);
      expect(screen.getByText(line)).toBeInTheDocument();
      // And a screen reader hears it with the box.
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(line);
    });

    it('has no rule to explain for an apartment community', async () => {
      stored = { ...SAVED, unitCount: 120 };
      await loaded({ communityType: 'apartment' });

      expect(screen.getByLabelText('Number of units')).toHaveValue(120);
      expect(screen.queryByText(/Florida law/)).not.toBeInTheDocument();
      expect(screen.getByLabelText('Number of units')).not.toHaveAccessibleDescription();
    });

    it('saves a changed count on its own route, and the rule follows the saved count', async () => {
      const { user } = await loaded();

      await replaceText(user, 'Number of units', '20');
      // Typing alone changes nothing the card says about the law.
      expect(screen.getByText(`${FOR_CONDO} Yours has 40.`)).toBeInTheDocument();
      await user.click(saveButton());

      await waitFor(() => expect(patchesTo(COUNT_PATH)).toHaveLength(1));
      expect(patchesTo(COUNT_PATH)[0]?.body).toEqual({ communityId: COMMUNITY_ID, unitCount: 20 });
      // Only the count changed, so the profile route is not called.
      expect(patchesTo(PROFILE_PATH)).toHaveLength(0);
      expect(
        await screen.findByText(`${FOR_CONDO} Yours has 20, so its website list is a recommendation.`),
      ).toBeInTheDocument();
      await waitFor(() => expect(saveButton()).toBeDisabled());
    });

    it('saves the profile and the count with one click, keeping the count out of the profile request', async () => {
      const { user } = await loaded();

      await replaceText(user, 'City', 'Surfside');
      await replaceText(user, 'Number of units', '60');
      await user.click(saveButton());

      await waitFor(() => expect(patchesTo(COUNT_PATH)).toHaveLength(1));
      expect(patchesTo(PROFILE_PATH)[0]?.body).toEqual({ communityId: COMMUNITY_ID, city: 'Surfside' });
      expect(patchesTo(COUNT_PATH)[0]?.body).toEqual({ communityId: COMMUNITY_ID, unitCount: 60 });
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    });

    it.each(['', '0', '100001', '2.5'])('refuses %j as a count without sending anything', async (typed) => {
      const { user } = await loaded();

      await replaceText(user, 'Number of units', typed);
      await user.click(saveButton());

      const box = screen.getByLabelText('Number of units');
      expect(await screen.findByText('Enter a whole number of units, from 1 to 100,000.')).toBeInTheDocument();
      expect(box).toHaveAttribute('aria-invalid', 'true');
      expect(box).toHaveAccessibleDescription(
        `${FOR_CONDO} Yours has 40. Enter a whole number of units, from 1 to 100,000.`,
      );
      expect(box).toHaveFocus();
      expect(sent.filter((request) => request.method === 'PATCH')).toHaveLength(0);
    });

    it('leaves an unknown count alone when its box is emptied again', async () => {
      stored = { ...SAVED, unitCount: null };
      const { user } = await loaded();

      // Nothing to clear when nothing was saved: this is not a mistake to point out.
      await replaceText(user, 'Number of units', '5');
      await replaceText(user, 'Number of units', '');
      await replaceText(user, 'City', 'Surfside');
      await user.click(saveButton());

      await waitFor(() => expect(patchesTo(PROFILE_PATH)).toHaveLength(1));
      expect(patchesTo(COUNT_PATH)).toHaveLength(0);
      expect(screen.queryByText(/whole number/)).not.toBeInTheDocument();
    });

    it('keeps what saved when the count fails, and retries only the count', async () => {
      handlers[`PATCH ${COUNT_PATH}`] = FAIL_500;
      const { user } = await loaded();

      await replaceText(user, 'City', 'Surfside');
      await replaceText(user, 'Number of units', '20');
      await user.click(saveButton());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent("We couldn't save your changes. Please try again.");
      expect(banner).toHaveTextContent('Your other changes were saved.');
      expect(patchesTo(PROFILE_PATH)).toHaveLength(1);
      expect(patchesTo(COUNT_PATH)).toHaveLength(1);
      expect(toastSuccess).not.toHaveBeenCalled();
      // The city is saved; the count still needs sending.
      expect(saveButton()).toBeEnabled();

      handlers[`PATCH ${COUNT_PATH}`] = serverHandlers()[`PATCH ${COUNT_PATH}`]!;
      await user.click(saveButton());

      await waitFor(() => expect(patchesTo(COUNT_PATH)).toHaveLength(2));
      // The city is not sent a second time.
      expect(patchesTo(PROFILE_PATH)).toHaveLength(1);
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });
  });

  describe('when only part of a save goes through', () => {
    it('still refreshes the page when the rename saved and the count then failed', async () => {
      handlers[`PATCH ${COUNT_PATH}`] = FAIL_500;
      const { user } = await loaded();

      await replaceText(user, 'Community name', 'Sunset Condominiums');
      await replaceText(user, 'Number of units', '20');
      await user.click(saveButton());

      await screen.findByRole('alert');
      expect(patchesTo(PROFILE_PATH)).toHaveLength(1);
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the profile cannot be shown', () => {
    it('shows a placeholder while it loads, and no fields', async () => {
      handlers[`GET ${PROFILE_PATH}`] = () => new Promise<Reply>(() => {});
      renderCard();

      expect(await screen.findByRole('status')).toHaveTextContent('Loading community profile');
      expect(screen.queryByLabelText('Community name')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument();
    });

    it('says so when it could not be loaded', async () => {
      handlers[`GET ${PROFILE_PATH}`] = FAIL_500;
      renderCard();

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent("We couldn't load your community profile.");
      expect(banner).toHaveTextContent('Please refresh the page to try again.');
      expect(screen.queryByLabelText('Community name')).not.toBeInTheDocument();
    });

    it('keeps showing a profile it already has when a refresh of it fails', async () => {
      handlers[`GET ${PROFILE_PATH}`] = FAIL_500;
      const { client } = renderCard({
        seed: (seeded) => seeded.setQueryData(['community-profile', COMMUNITY_ID], SAVED),
      });

      // The cached profile is stale on mount, so a refresh is attempted and fails.
      await waitFor(() =>
        expect(client.getQueryState(['community-profile', COMMUNITY_ID])?.status).toBe('error'),
      );
      expect(screen.getByLabelText('Community name')).toHaveValue(SAVED.name);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('gives the server’s reason at once, without retrying, when the subscription has lapsed', async () => {
      handlers[`GET ${PROFILE_PATH}`] = () =>
        refuse(
          403,
          'SUBSCRIPTION_REQUIRED',
          'This community’s subscription has lapsed. Reactivate to restore access.',
        );
      // The library's own retry and backoff: retrying a 403 would keep the skeleton up for about seven seconds.
      renderCard({ retries: 'library' });

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent("We couldn't load your community profile.");
      expect(banner).toHaveTextContent('This community’s subscription has lapsed. Reactivate to restore access.');
      expect(banner).not.toHaveTextContent('Please refresh the page');
      expect(sent.filter((request) => request.method === 'GET')).toHaveLength(1);
    });

    it('still retries a read that fails for a reason that may pass', async () => {
      handlers[`GET ${PROFILE_PATH}`] = FAIL_500;
      renderCard();

      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your community profile.");
      // The first attempt, and the app's usual three retries.
      expect(sent.filter((request) => request.method === 'GET')).toHaveLength(4);
    });
  });
});
