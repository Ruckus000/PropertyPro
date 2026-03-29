/**
 * Shared client-website display and status helpers.
 */

export type WebsiteUrlSource = 'custom_domain' | 'slug_fallback';

export interface WebsiteDomainInput {
  slug: string;
  customDomain?: string | null;
}

export interface WebsiteDomainInfo {
  displayUrl: string;
  urlSource: WebsiteUrlSource;
  ignoredInvalidCustomDomain: boolean;
}

export interface SiteLiveInput {
  sitePublishedAt?: string | null;
  subscriptionStatus?: string | null;
}

export interface SiteLiveStatus {
  isPublished: boolean;
  isBillingEligible: boolean;
  isLive: boolean;
  blockingReasons: Array<'publish_required' | 'billing_inactive'>;
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length < 3 || hostname.length > 253) return false;
  if (!hostname.includes('.')) return false;

  const labels = hostname.split('.');
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9-]+$/i.test(label)
    && !label.startsWith('-')
    && !label.endsWith('-')
  ));
}

function sanitizeCustomDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;

  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol
    .split(/[/?#]/, 1)[0]
    ?.split(':', 1)[0]
    ?.trim() ?? '';

  if (!hostname || !isValidHostname(hostname)) return null;
  return hostname;
}

export function getWebsiteDomainInfo(input: WebsiteDomainInput): WebsiteDomainInfo {
  const customDomain = sanitizeCustomDomain(input.customDomain);
  if (customDomain) {
    return {
      displayUrl: customDomain,
      urlSource: 'custom_domain',
      ignoredInvalidCustomDomain: false,
    };
  }

  return {
    displayUrl: `${input.slug}.getpropertypro.com`,
    urlSource: 'slug_fallback',
    ignoredInvalidCustomDomain: Boolean(input.customDomain?.trim()),
  };
}

export function getSiteLiveStatus(input: SiteLiveInput): SiteLiveStatus {
  const isPublished = Boolean(input.sitePublishedAt);
  const isBillingEligible = input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing';
  const blockingReasons: SiteLiveStatus['blockingReasons'] = [];

  if (!isPublished) {
    blockingReasons.push('publish_required');
  }

  if (!isBillingEligible) {
    blockingReasons.push('billing_inactive');
  }

  return {
    isPublished,
    isBillingEligible,
    isLive: isPublished && isBillingEligible,
    blockingReasons,
  };
}

export function formatSiteNotLiveMessage(status: SiteLiveStatus): string {
  if (status.blockingReasons.length === 0) return '';

  if (status.blockingReasons.length === 2) {
    return 'Publish a template and move billing to Active or Trialing.';
  }

  if (status.blockingReasons[0] === 'publish_required') {
    return 'Publish a public template to make the site live.';
  }

  return 'Set billing status to Active or Trialing to make the site live.';
}
