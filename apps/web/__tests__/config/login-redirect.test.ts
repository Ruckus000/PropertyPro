import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: { redirects?: () => Promise<unknown[]> }) => config,
}));

describe("next.config redirects", () => {
  it("permanently redirects /login to /auth/login", async () => {
    const nextConfig = (await import("../../next.config")).default;

    expect(nextConfig.redirects).toBeTypeOf("function");

    const redirects = await nextConfig.redirects!();
    const loginRedirect = redirects.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "source" in entry &&
        entry.source === "/login",
    );

    expect(loginRedirect).toEqual({
      source: "/login",
      destination: "/auth/login",
      permanent: true,
    });
  });
});
