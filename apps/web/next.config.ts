import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Point to monorepo root so Next.js doesn't pick up ~/package-lock.json
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
