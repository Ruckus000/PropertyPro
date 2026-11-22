/**
 * requireActorOwnsPi — a PaymentIntent is read only by the member who created
 * it, in the community it was created in (decision D15).
 *
 * Both matches are exact. The earlier form, `if (piUserId && piUserId !==
 * actor)`, passed a PI with no `userId` metadata to anyone, and never checked
 * `communityId` at all. Stripe is mocked; nothing here reaches the network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectFromMock, paymentIntentsRetrieveMock } = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  paymentIntentsRetrieveMock: vi.fn(),
}));

// finance-service imports the db barrel at module load, which constructs a
// drizzle client and throws on a missing DATABASE_URL — so these mocks are
// required just to import the module under test.
vi.mock('@propertypro/db', () => ({
  assessmentLineItems: {},
  rentObligations: {},
  rentPayments: {},
  assessments: {},
  createScopedClient: vi.fn(() => ({ selectFrom: selectFromMock })),
  financeStripeWebhookEvents: {},
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: vi.fn(),
  postLedgerEntry: vi.fn(),
  violationFines: {},
  violations: {},
  stripeConnectedAccounts: { id: 'id_col' },
  units: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  notInArray: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(() => ({
    paymentIntents: { retrieve: paymentIntentsRetrieveMock },
  })),
}));

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

import { ForbiddenError } from '@/lib/api/errors';
import { requireActorOwnsPi } from '../../src/lib/services/finance-service';

const COMMUNITY_ID = 42;
const ACTOR = 'owner-1';

function intentWith(metadata: Record<string, string>) {
  return { id: 'pi_123', status: 'succeeded', metadata };
}

describe('requireActorOwnsPi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFromMock.mockResolvedValue([{ id: 1, communityId: COMMUNITY_ID, stripeAccountId: 'acct_assoc' }]);
  });

  it('reads the PI from the community\'s connected account and returns it to its creator', async () => {
    const intent = intentWith({ userId: ACTOR, communityId: String(COMMUNITY_ID) });
    paymentIntentsRetrieveMock.mockResolvedValue(intent);

    await expect(requireActorOwnsPi('pi_123', ACTOR, COMMUNITY_ID)).resolves.toBe(intent);
    expect(paymentIntentsRetrieveMock).toHaveBeenCalledWith('pi_123', undefined, {
      stripeAccount: 'acct_assoc',
    });
  });

  it('refuses a PI another member created', async () => {
    paymentIntentsRetrieveMock.mockResolvedValue(
      intentWith({ userId: 'someone-else', communityId: String(COMMUNITY_ID) }),
    );

    await expect(requireActorOwnsPi('pi_123', ACTOR, COMMUNITY_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a PI with no userId metadata rather than treating it as anyone\'s', async () => {
    paymentIntentsRetrieveMock.mockResolvedValue(intentWith({ communityId: String(COMMUNITY_ID) }));

    await expect(requireActorOwnsPi('pi_123', ACTOR, COMMUNITY_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses the actor\'s own PI from a different community', async () => {
    paymentIntentsRetrieveMock.mockResolvedValue(intentWith({ userId: ACTOR, communityId: '99' }));

    await expect(requireActorOwnsPi('pi_123', ACTOR, COMMUNITY_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a PI with no communityId metadata', async () => {
    paymentIntentsRetrieveMock.mockResolvedValue(intentWith({ userId: ACTOR }));

    await expect(requireActorOwnsPi('pi_123', ACTOR, COMMUNITY_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
