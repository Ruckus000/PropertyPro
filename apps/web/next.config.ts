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
  //   - puppeteer-core / @sparticuz/chromium-min: Chromium binary is
  //     fetched from a CDN at runtime, so the package must remain a Node
  //     external (Chromium also cannot run on edge; the publish route
  //     exports runtime='nodejs').
  //   - isomorphic-dompurify / jsdom: jsdom creates its window AT MODULE
  //     LOAD and reads `default-stylesheet.css` from the installed
  //     package dir. When webpack bundles jsdom, that CSS asset gets
  //     relativized to `.next/...` where it does not exist, and any
  //     server route that imports the sanitizer fails page-data
  //     collection. Externalizing keeps jsdom resolved against real
  //     node_modules at runtime.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium-min",
    "isomorphic-dompurify",
    "jsdom",
  ],
  transpilePackages: [
    "@propertypro/ui",
    "@propertypro/shared",
    "@propertypro/db",
    "@propertypro/email",
    "@propertypro/theme",
    "@propertypro/tokens",
  ],
  env: {
    NEXT_PUBLIC_APP_ROLE: "web",
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
