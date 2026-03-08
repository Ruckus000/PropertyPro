"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Upload, Sparkles, ChevronRight, X } from "lucide-react";
import { Button } from "@propertypro/ui";
import type { ChecklistItemData } from "./compliance-checklist-item";

// ── Constants ─────────────────────────────────────────

const STORAGE_KEY_PREFIX = "propertypro:compliance-onboarding-dismissed";

/** Priority template keys — governing docs that should be uploaded first. */
const PRIORITY_KEYS = [
  "718_declaration", "720_declaration",
  "718_bylaws", "720_bylaws",
  "718_articles", "720_articles",
  "718_rules",
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  "718_declaration": "Your association's recorded Declaration of Condominium.",
  "720_declaration": "Your HOA's recorded Declaration of Covenants.",
  "718_bylaws": "Current bylaws and all adopted amendments.",
  "720_bylaws": "Current bylaws and all adopted amendments.",
  "718_articles": "Articles of Incorporation filed with the state.",
  "720_articles": "Articles of Incorporation filed with the state.",
  "718_rules": "Rules and regulations adopted by the board.",
};

// ── Detection ─────────────────────────────────────────

/**
 * Returns true if the community appears to be freshly set up:
 * all applicable items are unsatisfied/overdue and no documents are linked.
 */
export function isFreshChecklist(items: ChecklistItemData[]): boolean {
  const applicable = items.filter((i) => i.status !== "not_applicable");
  if (applicable.length === 0) return false;
  return applicable.every((i) => !i.documentId);
}

/**
 * Returns the priority items to display in the onboarding flow,
 * filtered to only those present in the checklist. Falls back to
 * the first 4 unsatisfied items if no priority keys match.
 */
function getPriorityItems(items: ChecklistItemData[]): ChecklistItemData[] {
  const unsatisfied = items.filter(
    (i) => i.status !== "satisfied" && i.status !== "not_applicable",
  );

  const priority = PRIORITY_KEYS
    .map((key) => unsatisfied.find((i) => i.templateKey === key))
    .filter((i): i is ChecklistItemData => !!i);

  if (priority.length > 0) return priority.slice(0, 4);
  return unsatisfied.slice(0, 4);
}

// ── Component ─────────────────────────────────────────

export interface ComplianceOnboardingProps {
  items: ChecklistItemData[];
  communityId: number;
  onUpload: (item: ChecklistItemData) => void;
}

export function ComplianceOnboarding({ items, communityId, onUpload }: ComplianceOnboardingProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const storageKey = `${STORAGE_KEY_PREFIX}:${communityId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setDismissed(stored === "true");
    } catch {
      // localStorage unavailable (e.g. private browsing) — stay hidden
    }
  }, [storageKey]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // localStorage unavailable — dismiss in memory only
    }
    setDismissed(true);
  }, [storageKey]);

  if (dismissed) return null;
  if (!isFreshChecklist(items)) return null;

  const priorityItems = getPriorityItems(items);
  if (priorityItems.length === 0) return null;

  // Count how many priority-key items are satisfied (checked against the full items list,
  // since getPriorityItems only returns unsatisfied items)
  const allPriorityKeys = PRIORITY_KEYS.filter((key) =>
    items.some((i) => i.templateKey === key),
  );
  const completedCount = items.filter(
    (i) => allPriorityKeys.includes(i.templateKey) && i.status === "satisfied",
  ).length;
  const totalPriorityCount = priorityItems.length + completedCount;

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
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Getting Started
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
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
            text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]
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
                    ? "bg-[var(--status-success)] text-[var(--surface-page)]"
                    : "bg-[var(--status-brand)] text-[var(--surface-page)]"
                  }
                `}
              >
                {isSatisfied ? "\u2713" : index + 1}
              </span>

              {/* Item info */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--text-primary)] block truncate">
                  {item.title}
                </span>
                {description && (
                  <span className="text-xs text-[var(--text-tertiary)] block truncate">
                    {description}
                  </span>
                )}
              </div>

              {/* Action */}
              {isSatisfied ? (
                <span className="text-xs font-medium text-[var(--status-success)] shrink-0">
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
          {Array.from({ length: totalPriorityCount }, (_, i) => (
            <span
              key={i}
              className={`
                h-1.5 w-1.5 rounded-full transition-colors duration-200
                ${i < completedCount
                  ? "bg-[var(--status-success)]"
                  : "bg-[var(--border-default)]"
                }
              `}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="
            flex items-center gap-1 text-xs text-[var(--text-tertiary)]
            hover:text-[var(--text-secondary)] transition-colors
          "
        >
          Skip for now
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
