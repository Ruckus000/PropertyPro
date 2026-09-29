/**
 * Resident contacts — Leases v3 (E11): people on a lease with no email and no
 * login. Notices go by mail or hand delivery; no portal invite is sent.
 *
 * Off by default. Both verbs refuse (403) unless the community has turned on
 * `community_settings.leasesAllowResidentsWithoutEmail`, read with a strict
 * `=== true` in `getCommunityLeaseSettings`.
 *
 * Authorization — every verb: requireAuthenticatedUserId → (POST)
 * assertNotDemoGrace → requireCommunityMembership → apartment gate →
 * requirePermission(membership, 'units', 'write'). Contacts carry home
 * addresses and phone numbers, so reads are manager-only too.
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  createResidentContact,
  getCommunityLeaseSettings,
  listUnlinkedResidentContacts,
} from '@/lib/services/lease-service';
import { leaseContactsGetContract, leaseContactsPostContract } from './contract';

function requireApartment(communityType: Parameters<typeof getFeaturesForCommunity>[0]): void {
  if (!getFeaturesForCommunity(communityType).hasLeaseTracking) {
    throw new ForbiddenError('Lease tracking is only available for apartment communities');
  }
}

async function requireContactsEnabled(communityId: number): Promise<void> {
  const settings = await getCommunityLeaseSettings(communityId);
  if (!settings.allowResidentsWithoutEmail) {
    throw new ForbiddenError('Residents without an email address are not enabled for this community');
  }
}

export const GET = withErrorHandler(
  runRoute(leaseContactsGetContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    // Lapsed communities lose admin reads, like the parent leases route.
    await requireEntitledForAdminRead(communityId, membership);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');
    await requireContactsEnabled(communityId);
    return listUnlinkedResidentContacts(communityId);
  }),
);

export const POST = withErrorHandler(
  runRoute(leaseContactsPostContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');
    await requireContactsEnabled(communityId);

    const contact = await createResidentContact(communityId, {
      fullName: body.fullName,
      phone: body.phone ?? null,
      mailingAddress: body.mailingAddress ?? null,
      noticeDelivery: body.noticeDelivery ?? 'mail',
      createdBy: actorUserId,
    });
    // Audit the fact, not the address: the audit log is readable by every
    // admin-tier user and this is a private person's home address.
    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'resident_contact',
      resourceId: String(contact.id),
      communityId,
      newValues: { fullName: body.fullName, noticeDelivery: body.noticeDelivery ?? 'mail' },
    });
    return contact;
  }),
);
