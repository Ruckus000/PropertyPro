import type { MetadataRoute } from 'next';

/**
 * The installable-app manifest, served by Next at `/manifest.webmanifest`.
 *
 * `start_url` is `/dashboard` rather than `/`: the root only redirects there,
 * and an installed app that opens on a redirect costs a round trip before the
 * first paint every single launch.
 *
 * The two colours are the literal values of the `sand-50` and `coral-500`
 * primitives (`packages/tokens/src/primitives.ts`). A web manifest is JSON read
 * by the operating system's installer, not CSS — it cannot resolve
 * `var(--surface-page)`, and there is no build step here that would inline it.
 * If the brand ramp moves, these move by hand.
 *
 * `/icons/*` is committed build output — see `scripts/generate-admin-icons.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PropertyPro Ops',
    short_name: 'PP Ops',
    description: 'PropertyPro platform operator console.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#FBF7F1', // design-tokens:exempt — web manifest cannot read CSS variables
    theme_color: '#CB6047', // design-tokens:exempt — web manifest cannot read CSS variables
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable icon is padded so a platform that crops to a circle or a
      // squircle cuts background, not the mark. Shipped as a SEPARATE entry
      // rather than `purpose: 'any maskable'` on one file, because a single
      // file cannot be correct for both: unpadded gets cropped, padded looks
      // shrunken wherever no mask is applied.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
