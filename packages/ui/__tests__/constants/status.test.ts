/**
 * Regression test for the 9-vs-23-key StatusBadge fork bug: the old
 * packages/ui STATUS_CONFIG only had 9 keys, so `getStatusConfig('rejected')`
 * silently fell back to the gray "Neutral" entry instead of the red
 * "Rejected" entry the web app's copy defined. Importing from the package's
 * public barrel (`../../src/index`) proves the fix at the same surface
 * StatusBadge consumes.
 */

import { describe, expect, it } from "vitest";
import { getStatusClasses, getStatusConfig, STATUS_CONFIG } from "../../src/index";

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

  // A plain object literal inherits from Object.prototype, so these keys used to
  // resolve to a TRUTHY inherited value — `??` never fired, and the caller got an
  // entry whose variant/label/icon were all undefined. StatusBadge then did
  // `STATUS_ICONS[undefined]`, handing React an undefined component, which throws
  // "Element type is invalid" and blanks the subtree. Reachable from any DB column
  // or API payload passed straight through as `status`.
  it.each(["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"])(
    "resolves the prototype key %s to neutral rather than an inherited member",
    (key) => {
      const config = getStatusConfig(key);
      expect(config.variant).toBe("neutral");
      expect(config.icon).toBe("neutral");
      expect(config.label).toBe("Neutral");
    },
  );
});

describe("getStatusClasses", () => {
  it("returns a usable class set for every variant, prototype keys included", () => {
    expect(getStatusClasses("owner").dot).toBe("bg-status-owner");
    // Same prototype-pollution shape as above: a bare lookup would hand back
    // Object.prototype's member instead of falling through to neutral.
    expect(
      getStatusClasses("constructor" as unknown as Parameters<typeof getStatusClasses>[0]).dot,
    ).toBe("bg-status-neutral");
  });

  it("hands out a SHARED entry — callers must not mutate it", () => {
    // Documents why the return type is Readonly: this is one object, not a copy
    // per call, so a write would corrupt every badge for the life of the process.
    // The readonly type is what prevents it; `tsc` rejects `classes.text = …`.
    expect(getStatusClasses("success")).toBe(getStatusClasses("success"));
  });
});
