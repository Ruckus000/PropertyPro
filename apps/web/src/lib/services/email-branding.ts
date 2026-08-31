/**
 * Shared email branding loader.
 *
 * Collapses the two near-identical `loadBranding` helpers that lived in
 * `notification-service.ts` and `announcement-delivery.ts`, and adds the one
 * thing both were missing: the association's postal address, which CAN-SPAM
 * requires on non-transactional mail and which `EmailLayout` now renders.
 *
 * The address is the ASSOCIATION's, not PropertyPro's — the association is the
 * sender of an announcement to its own members. `formatCommunityPostalAddress`
 * returns null for an incomplete address, and an incomplete address is simply
 * omitted rather than rendered partially.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import { communities, createScopedClient } from '@propertypro/db';
import type { CommunityBranding } from '@propertypro/email';
import { formatCommunityPostalAddress } from './postal-address';

/**
 * Community name + postal address for an email footer.
 *
 * Deliberately does NOT set `unsubscribeUrl` — that is per-recipient and
 * per-topic, so each sender spreads it onto the returned object itself.
 */
export async function loadEmailBranding(communityId: number): Promise<CommunityBranding> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === communityId);

  const communityName =
    typeof community?.['name'] === 'string' ? (community['name'] as string) : 'PropertyPro';

  if (!community) return { communityName };

  const postalAddressLines = formatCommunityPostalAddress({
    addressLine1: community['addressLine1'],
    addressLine2: community['addressLine2'],
    city: community['city'],
    state: community['state'],
    zipCode: community['zipCode'],
  });

  return postalAddressLines ? { communityName, postalAddressLines } : { communityName };
}
