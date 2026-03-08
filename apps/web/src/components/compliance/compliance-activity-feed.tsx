"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileUp,
  Link2,
  Unlink,
  EyeOff,
  Eye,
  Clock,
} from "lucide-react";

// ── Types ───────────────────────────────────────────

interface AuditEntry {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO
}

interface ActivityFeedResponse {
  data: AuditEntry[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  users: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function actionIcon(action: string) {
  switch (action) {
    case "link_document": return <Link2 size={12} />;
    case "unlink_document": return <Unlink size={12} />;
    case "mark_not_applicable": return <EyeOff size={12} />;
    case "mark_applicable": return <Eye size={12} />;
    case "upload_document": return <FileUp size={12} />;
    default: return <Clock size={12} />;
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "link_document": return "linked a document";
    case "unlink_document": return "unlinked a document";
    case "mark_not_applicable": return "marked as N/A";
    case "mark_applicable": return "marked as applicable";
    case "upload_document": return "uploaded a document";
    default: return action.replace(/_/g, " ");
  }
}

function actionDotColor(action: string): string {
  switch (action) {
    case "link_document":
    case "upload_document":
      return "bg-[var(--status-success)]";
    case "unlink_document":
      return "bg-[var(--status-warning)]";
    case "mark_not_applicable":
      return "bg-[var(--status-neutral)]";
    case "mark_applicable":
      return "bg-[var(--status-info)]";
    default:
      return "bg-[var(--border-default)]";
  }
}

// ── Component ───────────────────────────────────────

export interface ComplianceActivityFeedProps {
  communityId: number;
}

export function ComplianceActivityFeed({ communityId }: ComplianceActivityFeedProps) {
  const { data, isLoading, error } = useQuery<ActivityFeedResponse>({
    queryKey: ["compliance-activity", communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/audit-trail?communityId=${communityId}&limit=8`);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    staleTime: 2 * 60_000, // 2 minutes
  });

  const entries = data?.data ?? [];

  // Don't render anything if there are no entries or still loading with no data
  if (isLoading && entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Recent Activity
        </h3>
        <div className="flex flex-col gap-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--surface-muted)]" />
              <div className="h-3 rounded bg-[var(--surface-muted)]" style={{ width: `${100 + i * 30}px` }} />
              <div className="h-3 w-10 rounded bg-[var(--surface-muted)] ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Recent Activity
      </h3>

      <div className="flex flex-col">
        {entries.map((entry, idx) => {
          const itemTitle =
            (typeof entry.metadata?.itemTitle === 'string' && entry.metadata.itemTitle) ||
            (typeof entry.metadata?.documentTitle === 'string' && entry.metadata.documentTitle) ||
            entry.resourceId;

          return (
            <div
              key={entry.id}
              className={`
                flex items-start gap-2.5 py-2 px-1
                ${idx < entries.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}
              `}
            >
              {/* Action dot */}
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${actionDotColor(entry.action)}`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
                    {actionIcon(entry.action)}
                  </span>{" "}
                  {actionLabel(entry.action)}
                  {itemTitle && (
                    <>
                      {" \u2014 "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {itemTitle}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Timestamp */}
              <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 mt-0.5">
                {relativeTime(entry.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
