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
import { COMMUNITY_ASSETS_BUCKET } from '@propertypro/db/constants';
import type { CommunityBranding } from '@propertypro/email';
import type { CommunityBranding as StoredBranding } from '@propertypro/shared';
import { getBaseUrl } from '@/lib/utils/url';
import { formatCommunityPostalAddress } from './postal-address';

/**
 * Community name, postal address, notification-preferences link, and the
 * manager's logo and footer text for an email.
 *
 * `preferencesUrl` points at the in-app settings page (login-walled, unlike the
 * one-click unsubscribe link). It is only set for a community that exists, so
 * the fallback "PropertyPro" branding never links into a community that isn't
 * there.
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

  const preferencesUrl = `${getBaseUrl()}/settings?communityId=${communityId}`;

  const stored = (community['branding'] ?? {}) as StoredBranding;
  const logoUrl = emailLogoUrl(communityId, stored.emailLogoPath);
  const customEmailFooter = stored.customEmailFooter?.trim() || undefined;

  return {
    communityName,
    ...(postalAddressLines && { postalAddressLines }),
    preferencesUrl,
    ...(logoUrl && { logoUrl }),
    ...(customEmailFooter && { customEmailFooter }),
  };
}

/**
 * The public URL of the community's email logo, a PNG the branding route
 * writes to the public `community-assets` bucket. Public and permanent on
 * purpose: a mail client fetches it whenever the message is opened.
 *
 * Only a path under this community's own `email/` prefix gets a URL, so a
 * stray value cannot put another community's file in this community's mail.
 * `EmailLayout` additionally drops anything that is not https.
 */
function emailLogoUrl(communityId: number, path: string | undefined): string | undefined {
  if (!path || !path.startsWith(`${communityId}/email/`)) return undefined;
  if (path.includes('\\') || path.split('/').some((s) => s === '..' || s === '.')) return undefined;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return undefined;
  return `${base}/storage/v1/object/public/${COMMUNITY_ASSETS_BUCKET}/${path}`;
}
