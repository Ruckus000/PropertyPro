"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Upload, Sparkles, ChevronRight, X } from "lucide-react";
import { Button } from "@propertypro/ui";
import type { ChecklistItemData } from "./compliance-checklist-item";

// ── Constants ─────────────────────────────────────────

/**
 * Dismissal is remembered per community: a manager who skips the panel for one
 * association must still see it on the next one they set up.
 */
export function onboardingDismissedKey(communityId: number): string {
  return `propertypro:compliance-onboarding-dismissed:${communityId}`;
}

/**
 * Priority template keys — governing docs that should be uploaded first, in
 * the order they are shown. Each must exist in
 * `packages/shared/src/compliance/templates.ts`; a key that does not is
 * silently skipped, which is how HOAs once got a one-step panel
 * (`720_declaration` / `720_bylaws` never existed). A checklist holds one
 * community type's keys, so one interleaved list serves both.
 */
export const PRIORITY_KEYS = [
  "718_declaration", "720_governing_docs",
  "718_bylaws", "720_bylaws_rules",
  "718_articles", "720_articles",
  "718_rules",
] as const;

const STEP_DESCRIPTIONS: Record<string, string> = {
  "718_declaration": "Your association's recorded Declaration of Condominium.",
  "720_governing_docs": "Your HOA's recorded Declaration of Covenants and its amendments.",
  "718_bylaws": "Current bylaws and all adopted amendments.",
  "720_bylaws_rules": "Current bylaws and the rules adopted by the board.",
  "718_articles": "Articles of Incorporation filed with the state.",
  "720_articles": "Articles of Incorporation filed with the state.",
  "718_rules": "Rules and regulations adopted by the board.",
};

const MAX_STEPS = 4;

// ── Detection ─────────────────────────────────────────

/**
 * The getting-started steps: the priority items present in the checklist,
 * INCLUDING ones already satisfied, so progress can be shown. (Filtering out
 * satisfied items made `completedCount` always 0, so "Done" and the progress
 * dots never rendered.) Falls back to the first applicable items when no
 * priority key matches. Not-applicable items are never steps.
 */
export function getPriorityItems(items: ChecklistItemData[]): ChecklistItemData[] {
  const applicable = items.filter((i) => i.status !== "not_applicable");

  const priority = PRIORITY_KEYS
    .map((key) => applicable.find((i) => i.templateKey === key))
    .filter((i): i is ChecklistItemData => !!i);

  return (priority.length > 0 ? priority : applicable).slice(0, MAX_STEPS);
}

/**
 * Whether the panel belongs on screen: the community is still getting started
 * (no file posted anywhere outside the steps themselves) and at least one step
 * is unfinished. Posting a step's own file keeps the panel up so that step can
 * read "Done"; posting any other record means the manager has moved past it.
 */
export function shouldShowOnboarding(items: ChecklistItemData[]): boolean {
  const steps = getPriorityItems(items);
  if (steps.length === 0) return false;
  if (steps.every((i) => i.status === "satisfied")) return false;

  const stepIds = new Set(steps.map((i) => i.id));
  return items
    .filter((i) => i.status !== "not_applicable" && !stepIds.has(i.id))
    .every((i) => !i.documentId);
}

// ── Component ─────────────────────────────────────────

export interface ComplianceOnboardingProps {
  communityId: number;
  items: ChecklistItemData[];
  onUpload: (item: ChecklistItemData) => void;
}

export function ComplianceOnboarding({ communityId, items, onUpload }: ComplianceOnboardingProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const storageKey = onboardingDismissedKey(communityId);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      // Storage blocked (private mode, policy): show the panel.
    }
    setDismissed(stored === "true");
  }, [storageKey]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Storage blocked: the dismissal lasts for this view only.
    }
    setDismissed(true);
  }, [storageKey]);

  if (dismissed) return null;
  if (!shouldShowOnboarding(items)) return null;

  const priorityItems = getPriorityItems(items);
  const completedCount = priorityItems.filter((i) => i.status === "satisfied").length;

  return (
    <div
      className="
        rounded-[var(--radius-lg)] border border-[var(--status-brand-border)]
        bg-[var(--status-brand-bg)] overflow-hidden
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-[var(--status-brand)] shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-content">
              Getting Started
            </span>
            <span className="text-xs text-content-tertiary">
              Upload your key governing documents to get compliant
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="
            rounded-[var(--radius-sm)] p-1
            hover:bg-[var(--status-brand-subtle)] transition-colors
            text-content-tertiary hover:text-content-secondary
          "
          aria-label="Dismiss onboarding"
        >
          <X size={14} />
        </button>
      </div>

      {/* Priority items */}
      <div className="border-t border-[var(--status-brand-border)]/50">
        {priorityItems.map((item, index) => {
          const isSatisfied = item.status === "satisfied";
          const description = STEP_DESCRIPTIONS[item.templateKey] ?? item.description;
          return (
            <div
              key={item.id}
              className={`
                flex items-center gap-3 px-4 py-3
                ${index < priorityItems.length - 1 ? "border-b border-[var(--status-brand-border)]/30" : ""}
                ${isSatisfied ? "opacity-60" : ""}
              `}
            >
              {/* Step number */}
              <span
                className={`
                  flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold
                  ${isSatisfied
                    ? "bg-[var(--status-success)] text-white"
                    : "bg-[var(--status-brand)] text-white"
                  }
                `}
              >
                {isSatisfied ? "\u2713" : index + 1}
              </span>

              {/* Item info */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-content block truncate" title={item.title}>
                  {item.title}
                </span>
                {description && (
                  <span className="text-xs text-content-tertiary block truncate" title={description}>
                    {description}
                  </span>
                )}
              </div>

              {/* Action */}
              {isSatisfied ? (
                <span className="text-xs font-medium text-status-success shrink-0">
                  Done
                </span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onUpload(item)}
                  className="shrink-0"
                >
                  <Upload size={12} className="mr-1.5" />
                  Upload
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with progress dots */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--status-brand-border)]/50 bg-[var(--status-brand-bg)]">
        <div className="flex items-center gap-1.5">
          {priorityItems.map((item) => (
            <span
              key={item.id}
              aria-hidden="true"
              data-step-done={item.status === "satisfied" ? "true" : "false"}
              className={`
                h-1.5 w-1.5 rounded-full transition-colors duration-quick
                ${item.status === "satisfied"
                  ? "bg-[var(--status-success)]"
                  : "bg-[var(--border-default)]"
                }
              `}
            />
          ))}
          <span className="sr-only">
            {completedCount} of {priorityItems.length} done
          </span>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="
            flex items-center gap-1 text-xs text-content-tertiary
            hover:text-content-secondary transition-colors
          "
        >
          Skip for now
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
