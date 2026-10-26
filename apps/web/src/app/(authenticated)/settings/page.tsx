import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences';
import { SnowbirdDigestCard } from '@/components/settings/snowbird-digest-card';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';
import { SmsConsentCard } from '@/components/settings/sms-consent-card';
import { NoticeConsentCard } from '@/components/settings/notice-consent-card';
import { SupportAccessSettings } from '@/components/settings/SupportAccessSettings';
import { AccessSettingsCard } from '@/components/settings/access-settings-card';
import { EmailFooterCard } from '@/components/settings/email-footer-card';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { PageHeader } from '@/components/shared/page-header';
import { PageBody } from '@/components/shared/page-body';
import {
  SettingsCard,
  SettingsLinkRow,
  SettingsSection,
} from '@/components/settings/settings-layout';
import { SettingsNav, type SettingsNavGroup } from '@/components/settings/settings-nav';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// The `users` table has no community_id to scope by, and this reads exactly one
// row — the signed-in user's own — for their phone number. Same shape and same
// reason as settings/account/page.tsx.
// AUTHZ: settings page — single-row read of the SIGNED-IN user's own record.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';

/**
 * Settings page — personal preferences for every member, community settings
 * for managers. Laid out in the Geist settings pattern: a section menu at the
 * left (a sideways-scrolling row on phones), and per section a heading plus one
 * bordered card of label/control rows. See components/settings/settings-layout.tsx.
 *
 * Uses resolveCommunityContext for consistent tenant resolution
 * across all authenticated pages.
 *
 * RBAC note: The RBAC matrix's 'settings' resource governs community-level
 * settings (branding, configuration), not personal notification preferences.
 * All community members can manage their own notification preferences
 * regardless of role. When community-level settings are added to this page,
 * gate those sections with checkPermission(role, communityType, 'settings', 'read').
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    // Defense in depth — middleware should already have redirected an
    // authenticated user with no tenant context to /select-community. If we
    // somehow reach this branch (e.g. middleware bypass on a static export),
    // bounce to the picker rather than rendering a broken placeholder.
    // Preserve the incoming query string so the picker can hand the user back
    // to e.g. /settings?tab=notifications instead of bare /settings.
    const incomingSearch = toUrlSearchParams(resolvedSearchParams).toString();
    const returnTo = incomingSearch ? `/settings?${incomingSearch}` : '/settings';
    redirect(`/select-community?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  const canReadMeetings = checkPermissionV2(
    membership.role,
    membership.communityType,
    'meetings',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  const canReadFinances = checkPermissionV2(
    membership.role,
    membership.communityType,
    'finances',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  // SMS consent is shown only where a text could actually be sent: the
  // per-community legal gate AND the deployment-wide env floor must both be on.
  // Offering to collect TCPA consent for a channel that cannot dispatch is
  // worse than offering nothing — it records a consent the resident gave for a
  // service they will never receive.
  const smsAvailable = membership.smsDispatchEnabled && isSmsDispatchGloballyEnabled();
  let currentPhone: string | null = null;
  let phoneVerified = false;
  if (smsAvailable) {
    const rows = await createUnscopedClient()
      .select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    currentPhone = rows[0]?.phone ?? null;
    phoneVerified = rows[0]?.phoneVerifiedAt != null;
  }

  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanId(membership.subscriptionPlan),
  );
  const showTenantAccess = membership.isAdmin && membership.communityType !== 'apartment';

  // The menu lists exactly the sections this member will see below.
  const navGroups: SettingsNavGroup[] = [
    {
      label: 'Personal',
      items: [
        { id: 'account', label: 'Account' },
        { id: 'notifications', label: 'Notifications' },
        ...(smsAvailable ? [{ id: 'sms-alerts', label: 'Text alerts' }] : []),
        { id: 'display', label: 'Display' },
      ],
    },
    ...(membership.isAdmin
      ? [
          {
            label: 'Community',
            items: [
              { id: 'billing', label: 'Payments & billing' },
              { id: 'email-footer', label: 'Email footer' },
              ...(showTenantAccess ? [{ id: 'tenant-access', label: 'Tenant access' }] : []),
              { id: 'support-access', label: 'Support access' },
            ],
          },
        ]
      : []),
  ];

  return (
    <PageBody>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
        <div className="min-w-0 xl:sticky xl:top-6 xl:w-52 xl:shrink-0">
          <SettingsNav groups={navGroups} />
        </div>

        <div className="min-w-0 flex-1 space-y-12 xl:max-w-3xl">
          <SettingsSection id="account" title="Account" description="Your sign-in details.">
            <SettingsCard>
              <SettingsLinkRow
                href="/settings/account"
                title="Account details"
                description="Update your name, phone number, and password."
              />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Choose which emails you receive and when they should be delivered."
          >
            <NotificationPreferencesForm
              communityId={context.communityId}
              reminderVisibility={{
                meetings: canReadMeetings,
                personalAssessments:
                  canReadFinances && membership.role === 'resident' && membership.isUnitOwner,
                communityAssessments: canReadFinances && membership.isAdmin,
              }}
              showInsuranceAlerts={membership.isAdmin && features.hasInsuranceHub}
            />
            {features.hasSnowbirdDigest && (
              <SnowbirdDigestCard communityId={context.communityId} canManage={membership.isAdmin} />
            )}
            {/* Electronic-notice consent is an owner's statutory choice (§718.112(2)(d), §720.303). */}
            {membership.role === 'resident' && membership.isUnitOwner && (
              <NoticeConsentCard communityId={context.communityId} />
            )}
          </SettingsSection>

          {smsAvailable && (
            <SettingsSection
              id="sms-alerts"
              title="Text alerts"
              description="Verify your mobile number to receive emergency alerts by text. Message and data rates may apply. Reply STOP to any message to opt out."
            >
              <SmsConsentCard
                communityId={context.communityId}
                currentPhone={currentPhone}
                phoneVerified={phoneVerified}
              />
            </SettingsSection>
          )}

          <SettingsSection
            id="display"
            title="Display"
            description="Adjust how PropertyPro looks on this device."
          >
            <AccessibilitySettings />
          </SettingsSection>

          {membership.isAdmin && (
            <>
              <SettingsSection
                id="billing"
                title="Payments & billing"
                description="Community-level configuration. Only managers see this."
              >
                <SettingsCard>
                  <SettingsLinkRow
                    href={`/settings/payments?communityId=${context.communityId}`}
                    title="Payment configuration"
                    description="Connect Stripe, manage payment processing fees, and configure payment settings."
                  />
                  <SettingsLinkRow
                    href={`/settings/billing?communityId=${context.communityId}`}
                    title="Billing & subscription"
                    description="View your current plan, manage your subscription, and access invoices."
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection id="email-footer" title="Email footer">
                <EmailFooterCard
                  communityId={context.communityId}
                  communityName={membership.communityName}
                />
              </SettingsSection>

              {showTenantAccess && (
                <SettingsSection
                  id="tenant-access"
                  title="Tenant access"
                  description="Choose whether tenants can open inspection reports. Owners always can."
                >
                  <AccessSettingsCard communityId={context.communityId} />
                </SettingsSection>
              )}

              <SettingsSection
                id="support-access"
                title="Support access"
                description="Control whether PropertyPro support staff can access this community for troubleshooting."
              >
                <SupportAccessSettings communityId={context.communityId} />
              </SettingsSection>
            </>
          )}
        </div>
      </div>
    </PageBody>
  );
}
