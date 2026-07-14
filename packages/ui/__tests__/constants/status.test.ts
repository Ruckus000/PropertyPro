/**
 * Regression test for the 9-vs-23-key StatusBadge fork bug: the old
 * packages/ui STATUS_CONFIG only had 9 keys, so `getStatusConfig('rejected')`
 * silently fell back to the gray "Neutral" entry instead of the red
 * "Rejected" entry the web app's copy defined. Importing from the package's
 * public barrel (`../../src/index`) proves the fix at the same surface
 * StatusBadge consumes.
 */

import { describe, expect, it } from "vitest";
import { getStatusConfig, STATUS_CONFIG } from "../../src/index";

describe("getStatusConfig (canonical, via @propertypro/ui barrel)", () => {
  it("resolves 'rejected' to the danger Rejected entry, not the neutral fallback", () => {
    const config = getStatusConfig("rejected");
    expect(config.label).toBe("Rejected");
    expect(config.variant).toBe("danger");
  });

  it("covers keys that were missing from the old 9-key packages/ui copy", () => {
    for (const key of [
      "satisfied",
      "certified",
      "assigned",
      "review",
      "canceled",
      "cancelled",
      "created",
      "confirmed",
      "open",
      "closed",
      "draft",
      "not_applicable",
    ] as const) {
      expect(STATUS_CONFIG[key]).toBeDefined();
      expect(getStatusConfig(key).label).toBe(STATUS_CONFIG[key].label);
    }
  });

  it("still falls back to neutral for a genuinely unknown status", () => {
    expect(getStatusConfig("totally-made-up-status").label).toBe("Neutral");
  });
});
