import { describe, expect, it } from 'vitest';
import {
  formatSiteNotLiveMessage,
  getSiteLiveStatus,
  getWebsiteDomainInfo,
} from '@/lib/clients/website';

describe('getWebsiteDomainInfo', () => {
  it('prefers custom domain when present', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: 'SunsetCondo.org',
    });

    expect(result).toEqual({
      displayUrl: 'sunsetcondo.org',
      urlSource: 'custom_domain',
      ignoredInvalidCustomDomain: false,
    });
  });

  it('falls back to slug subdomain when custom domain is missing', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: null,
    });

    expect(result).toEqual({
      displayUrl: 'sunset-condos.getpropertypro.com',
      urlSource: 'slug_fallback',
      ignoredInvalidCustomDomain: false,
    });
  });

  it('sanitizes protocol and trailing slash from custom domain', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: 'https://Portal.SunsetCondo.org/',
    });

    expect(result).toEqual({
      displayUrl: 'portal.sunsetcondo.org',
      urlSource: 'custom_domain',
      ignoredInvalidCustomDomain: false,
    });
  });

  it('uses only hostname when custom domain includes path and port', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: 'http://portal.sunsetcondo.org:8443/welcome?x=1',
    });

    expect(result).toEqual({
      displayUrl: 'portal.sunsetcondo.org',
      urlSource: 'custom_domain',
      ignoredInvalidCustomDomain: false,
    });
  });

  it('falls back to slug subdomain for invalid custom domain values', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: 'javascript:alert(1)',
    });

    expect(result).toEqual({
      displayUrl: 'sunset-condos.getpropertypro.com',
      urlSource: 'slug_fallback',
      ignoredInvalidCustomDomain: true,
    });
  });

  it('falls back to slug subdomain for hostname without dot', () => {
    const result = getWebsiteDomainInfo({
      slug: 'sunset-condos',
      customDomain: 'localhost',
    });

    expect(result).toEqual({
      displayUrl: 'sunset-condos.getpropertypro.com',
      urlSource: 'slug_fallback',
      ignoredInvalidCustomDomain: true,
    });
  });
});

describe('getSiteLiveStatus', () => {
  it('is live when published and billing is active', () => {
    const status = getSiteLiveStatus({
      sitePublishedAt: '2026-03-26T12:00:00.000Z',
      subscriptionStatus: 'active',
    });

    expect(status).toEqual({
      isPublished: true,
      isBillingEligible: true,
      isLive: true,
      blockingReasons: [],
    });
  });

  it('is live when published and billing is trialing', () => {
    const status = getSiteLiveStatus({
      sitePublishedAt: '2026-03-26T12:00:00.000Z',
      subscriptionStatus: 'trialing',
    });

    expect(status.isLive).toBe(true);
  });

  it('is not live when unpublished and billing inactive', () => {
    const status = getSiteLiveStatus({
      sitePublishedAt: null,
      subscriptionStatus: 'past_due',
    });

    expect(status).toEqual({
      isPublished: false,
      isBillingEligible: false,
      isLive: false,
      blockingReasons: ['publish_required', 'billing_inactive'],
    });
  });

  it('is not live when published but billing inactive', () => {
    const status = getSiteLiveStatus({
      sitePublishedAt: '2026-03-26T12:00:00.000Z',
      subscriptionStatus: 'canceled',
    });

    expect(status).toEqual({
      isPublished: true,
      isBillingEligible: false,
      isLive: false,
      blockingReasons: ['billing_inactive'],
    });
  });

  it('is not live when not published even with active billing', () => {
    const status = getSiteLiveStatus({
      sitePublishedAt: null,
      subscriptionStatus: 'active',
    });

    expect(status).toEqual({
      isPublished: false,
      isBillingEligible: true,
      isLive: false,
      blockingReasons: ['publish_required'],
    });
  });
});

describe('formatSiteNotLiveMessage', () => {
  it('returns combined message when both blockers are present', () => {
    const msg = formatSiteNotLiveMessage({
      isPublished: false,
      isBillingEligible: false,
      isLive: false,
      blockingReasons: ['publish_required', 'billing_inactive'],
    });

    expect(msg).toBe('Publish a template and move billing to Active or Trialing.');
  });

  it('returns publish-focused message when publish is missing', () => {
    const msg = formatSiteNotLiveMessage({
      isPublished: false,
      isBillingEligible: true,
      isLive: false,
      blockingReasons: ['publish_required'],
    });

    expect(msg).toBe('Publish a public template to make the site live.');
  });

  it('returns billing-focused message when billing is missing', () => {
    const msg = formatSiteNotLiveMessage({
      isPublished: true,
      isBillingEligible: false,
      isLive: false,
      blockingReasons: ['billing_inactive'],
    });

    expect(msg).toBe('Set billing status to Active or Trialing to make the site live.');
  });
});
