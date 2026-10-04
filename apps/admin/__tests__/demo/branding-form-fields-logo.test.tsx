// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrandingFormFields, type BrandingValues } from '@/components/demo/BrandingFormFields';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VALUES: BrandingValues = {
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoPath: '7/site/abc.png',
};

async function render(knownLogoUrls?: Record<string, string>) {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <BrandingFormFields value={VALUES} onChange={() => {}} communityId={7} knownLogoUrls={knownLogoUrls} />,
    );
  });
  const src = container.querySelector('img[alt="Logo"]')?.getAttribute('src') ?? null;
  await act(async () => root.unmount());
  return src;
}

describe('demo branding fields: the stored logo', () => {
  it('shows a stored logo from the URL the branding GET returned', async () => {
    expect(await render({ '7/site/abc.png': 'https://cdn/abc.png' })).toBe('https://cdn/abc.png');
  });

  it('shows no image for a stored path it has no URL for, rather than a broken one', async () => {
    expect(await render()).toBeNull();
  });
});
