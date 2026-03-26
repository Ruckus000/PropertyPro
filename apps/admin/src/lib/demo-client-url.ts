/**
 * Public web app URL for client-facing demo links (`/demo/[slug]`).
 * Admin runs on a different origin; never use `window.location.origin` for the client link.
 */
export function getWebAppPublicBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'http://localhost:3000';
  }
  return process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'https://propertyprofl.com';
}

export function getClientDemoLandingUrl(slug: string): string {
  const base = getWebAppPublicBaseUrl().replace(/\/$/, '');
  return `${base}/demo/${slug}`;
}
