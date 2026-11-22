/**
 * /payments/success — Stripe's return page shows a payment only to the member
 * who made it, in the community it was made in (decision D15).
 *
 * `?payment_intent=` is just a query parameter, so before this the page read
 * any PI id from the PLATFORM account and printed its status to whoever asked.
 * Now the return URL carries `communityId`; the page checks the viewer's
 * membership there, then reads the PI through `requireActorOwnsPi` (connected
 * account + exact user/community match). Every refusal renders one generic
 * "couldn't find that payment" state that names no status.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@/lib/api/errors';

const {
  requirePageAuthenticatedUserIdMock,
  requirePageCommunityMembershipMock,
  requireActorOwnsPiMock,
} = vi.hoisted(() => ({
  requirePageAuthenticatedUserIdMock: vi.fn(),
  requirePageCommunityMembershipMock: vi.fn(),
  requireActorOwnsPiMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requirePageAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requirePageCommunityMembershipMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  requireActorOwnsPi: requireActorOwnsPiMock,
}));

import PaymentSuccessPage from '@/app/(authenticated)/payments/success/page';

const NOT_FOUND = 'We couldn&#x27;t find that payment';

async function render(searchParams: Record<string, string>): Promise<string> {
  const element = await PaymentSuccessPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe('PaymentSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePageAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    requirePageCommunityMembershipMock.mockResolvedValue({ communityId: 42, userId: 'owner-1' });
    requireActorOwnsPiMock.mockResolvedValue({ id: 'pi_123', status: 'succeeded' });
  });

  it('shows the creator their payment, read with the viewer and the community', async () => {
    const html = await render({ payment_intent: 'pi_123', communityId: '42' });

    expect(html).toContain('Payment received');
    expect(requirePageCommunityMembershipMock).toHaveBeenCalledWith(42, 'owner-1');
    expect(requireActorOwnsPiMock).toHaveBeenCalledWith('pi_123', 'owner-1', 42);
  });

  it('refuses a viewer who is not a member of the community, without reading the PI', async () => {
    requirePageCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('User is not a member of this community'),
    );

    const html = await render({ payment_intent: 'pi_123', communityId: '42' });

    expect(html).toContain(NOT_FOUND);
    expect(html).not.toContain('Payment received');
    expect(requireActorOwnsPiMock).not.toHaveBeenCalled();
  });

  it('refuses a PI that belongs to another member, naming no status', async () => {
    requireActorOwnsPiMock.mockRejectedValue(new ForbiddenError('You can only access your own payments'));

    const html = await render({ payment_intent: 'pi_123', communityId: '42' });

    expect(html).toContain(NOT_FOUND);
    expect(html).not.toMatch(/received|processing|not completed/i);
  });

  it('refuses a PI that is not on this community\'s connected account', async () => {
    requireActorOwnsPiMock.mockRejectedValue(
      Object.assign(new Error('No such payment_intent'), { code: 'resource_missing' }),
    );

    const html = await render({ payment_intent: 'pi_other', communityId: '42' });

    expect(html).toContain(NOT_FOUND);
  });

  it('refuses a return URL with no community, without reading anything', async () => {
    const html = await render({ payment_intent: 'pi_123' });

    expect(html).toContain(NOT_FOUND);
    expect(requirePageCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireActorOwnsPiMock).not.toHaveBeenCalled();
  });
});
