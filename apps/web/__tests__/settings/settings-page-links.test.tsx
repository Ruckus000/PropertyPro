/**
 * The Settings page's "Account details" link must carry the community.
 *
 * On the apex (or `www`, or a preview host) the community comes only from
 * `?communityId=`. A bare `/settings/account` there has no tenant context, so
 * middleware bounces it to /select-community and the member has to pick their
 * community again just to edit their own name. Every other link on this page
 * already carried `?communityId=`; this one did not (pattern:
 * `lib/dashboard/quick-actions.ts`, `updateContact`).
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { requireAuthenticatedUserIdMock, requireCommunityMembershipMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireCommunityMembershipMock,
}));

// The page's interactive cards are client components with their own data
// hooks; none of them is under test here.
const { Null } = vi.hoisted(() => ({ Null: () => null }));
vi.mock('@/components/settings/notification-preferences', () => ({ NotificationPreferencesForm: Null }));
vi.mock('@/components/settings/snowbird-digest-card', () => ({ SnowbirdDigestCard: Null }));
vi.mock('@/components/settings/accessibility-settings', () => ({ AccessibilitySettings: Null }));
vi.mock('@/components/settings/sms-consent-card', () => ({ SmsConsentCard: Null }));
vi.mock('@/components/settings/notice-consent-card', () => ({ NoticeConsentCard: Null }));
vi.mock('@/components/settings/SupportAccessSettings', () => ({ SupportAccessSettings: Null }));
vi.mock('@/components/settings/access-settings-card', () => ({ AccessSettingsCard: Null }));
vi.mock('@/components/settings/email-footer-card', () => ({ EmailFooterCard: Null }));
vi.mock('@/components/settings/community-profile-card-lazy', () => ({ LazyCommunityProfileCard: Null }));
vi.mock('@/components/settings/settings-nav', () => ({ SettingsNav: Null }));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: Null }));

vi.mock('@propertypro/db', () => ({ users: {} }));
vi.mock('@propertypro/db/filters', () => ({ eq: vi.fn() }));
vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: vi.fn() }));
vi.mock('@/lib/sms/dispatch-flag', () => ({ isSmsDispatchGloballyEnabled: () => false }));

import SettingsPage from '../../src/app/(authenticated)/settings/page';

async function renderSettings(searchParams: Record<string, string>): Promise<string> {
  const element = await SettingsPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe('settings page — account link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      isUnitOwner: true,
      isAdmin: false,
      communityType: 'condo_718',
      subscriptionPlan: 'professional',
      smsDispatchEnabled: false,
    });
  });

  it('links Account details with the current communityId', async () => {
    const html = await renderSettings({ communityId: '42' });

    expect(html).toContain('href="/settings/account?communityId=42"');
    expect(html).not.toContain('href="/settings/account"');
  });

  it('control: the page rendered for the requested community', async () => {
    await renderSettings({ communityId: '42' });

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
  });
});
