import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Point to monorepo root so Next.js doesn't pick up ~/package-lock.json
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Lint runs in the dedicated CI lint job (`pnpm lint`). Without this flag,
  // the presence of eslint.config.mjs re-arms Next's build-time lint pass,
  // slowing every build and turning error-severity findings into a second,
  // unintended deploy gate inside `vercel build --prod`.
  eslint: { ignoreDuringBuilds: true },
  // Tenant subdomain Playwright (localtest.me) fetches /_next/* from a different
  // dev host than the document; Next 15 requires this allowlist in development.
  allowedDevOrigins: [
    "http://localtest.me:3002",
    "http://sunset-condos.localtest.me:3002",
    "http://palm-shores-hoa.localtest.me:3002",
    "http://*.localtest.me:3002",
  ],
  // Server-only packages that must not be bundled by webpack:
  //   - puppeteer-core / @sparticuz/chromium: the package resolves its
  //     Brotli binaries by path RELATIVE TO ITS OWN INSTALL DIR, so webpack
  //     must not bundle it — a bundled copy relativizes that path into
  //     `.next/...` where bin/chromium.br does not exist. (Chromium also
  //     cannot run on edge; the publish route exports runtime='nodejs'.)
  //   - isomorphic-dompurify / jsdom: jsdom creates its window AT MODULE
  //     LOAD and reads `default-stylesheet.css` from the installed
  //     package dir. When webpack bundles jsdom, that CSS asset gets
  //     relativized to `.next/...` where it does not exist, and any
  //     server route that imports the sanitizer fails page-data
  //     collection. Externalizing keeps jsdom resolved against real
  //     node_modules at runtime.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
    "isomorphic-dompurify",
    "jsdom",
  ],
  // Ship Chromium's Brotli binaries with the publish route. From v149 the
  // package is ESM-only and finds bin/ via `import.meta.url`, which nft does
  // not follow, so without this the route deploys WITHOUT a browser (traced
  // 16.7 MB instead of ~88). Resolve the real store path the way the package
  // resolves itself: a glob through the apps/web/node_modules symlink would
  // put the files where the code never looks, and a version wildcard would
  // also ship any stale copy left in a local store.
  outputFileTracingIncludes: {
    "/api/v1/documents/drafts/[id]/publish": [
      path.relative(
        __dirname,
        path.join(path.dirname(require.resolve("@sparticuz/chromium")), "..", "bin", "*.br"),
      ),
    ],
  },
  transpilePackages: [
    "@propertypro/ui",
    "@propertypro/shared",
    "@propertypro/db",
    "@propertypro/email",
    "@propertypro/theme",
    "@propertypro/tokens",
  ],
  experimental: {
    // Tree-shake barrel imports from the workspace packages so importing one
    // component doesn't pull the whole barrel into every route chunk.
    // (lucide-react, date-fns, and recharts are already in Next 15.5's
    // built-in default list — do not re-add them here.)
    optimizePackageImports: ["@propertypro/ui", "@propertypro/shared"],
    // No `staleTimes.dynamic` on purpose. Back/forward is cached anyway; a
    // stale time only adds reuse on re-click, and every domain mutation goes
    // through an API route, which never clears the router cache. The dashboard
    // (server-rendered meetings, announcements, signers, violations,
    // maintenance) would show stale data for that window after any change.
    // Add it only together with a router.refresh() after mutations.
  },
  env: {
    NEXT_PUBLIC_APP_ROLE: "web",
    // Top tabs are ON unless this is exactly "false" (the kill switch). Always
    // defined, so `process.env.NEXT_PUBLIC_TOP_NAV_ENABLED !== 'false'` is inlined
    // as two string literals that webpack folds, and a kill-switched build drops
    // the tab row's import()s (see app-shell.tsx). Next inlines a NEXT_PUBLIC_
    // variable only when it is set, and CI and production set none: left
    // undefined, the check survives to runtime and the import()s stay.
    NEXT_PUBLIC_TOP_NAV_ENABLED:
      process.env.NEXT_PUBLIC_TOP_NAV_ENABLED === "false" ? "false" : "true",
    // Same reason. Every read is `=== 'true'`, so this mapping changes no build's
    // behaviour; it only lets webpack fold the check where the variable is unset
    // (CI, local). Production sets it in Vercel and was already inlined. Unset, the
    // check and both branches survived in ~40 first-load chunks.
    NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED:
      process.env.NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED === "true" ? "true" : "false",
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/auth/login",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Silence plugin output when no auth token is present (no uploads will happen anyway)
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Disable Sentry telemetry
  telemetry: false,

  // Only upload source maps when auth token is present
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Automatically tree-shake Sentry logger in production
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
