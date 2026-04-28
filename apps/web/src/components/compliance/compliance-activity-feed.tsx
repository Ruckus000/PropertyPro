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
import { ComplianceActivityHistoryModal } from "./compliance-activity-history-modal";

// ── Types ───────────────────────────────────────────

interface AuditEntry {
  id: number;
  userId: string | null;
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

class ActivityFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const { data, isLoading, error } = useQuery<ActivityFeedResponse, ActivityFetchError>({
    queryKey: ["compliance-activity", communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/audit-trail?communityId=${communityId}&limit=8`);
      if (!res.ok) {
        throw new ActivityFetchError(res.status, "Failed to load activity");
      }
      return res.json();
    },
    staleTime: 2 * 60_000, // 2 minutes
    retry: false,
  });

  // Defensive: deduplicate by ID in case the API ever returns duplicate rows.
  const entries = React.useMemo(() => {
    const raw = data?.data ?? [];
    const seen = new Set<number>();
    return raw.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }, [data]);

  // Hide entire panel if the user lacks audit:read permission (403). Otherwise
  // always render the header so "View all history" is reachable.
  if (error?.status === 403) return null;

  if (isLoading && entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
          Recent Activity
        </h3>
        <div className="flex flex-col gap-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-1">
              <div className="h-1.5 w-1.5 rounded-full bg-surface-muted" />
              <div className="h-3 rounded bg-surface-muted" style={{ width: `${100 + i * 30}px` }} />
              <div className="h-3 w-10 rounded bg-surface-muted ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const users = data?.users ?? {};

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
          Recent Activity
        </h3>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="text-xs font-medium text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm px-1"
        >
          View all history
        </button>
      </div>

      {error ? (
        <p className="text-xs text-status-danger">
          Couldn&apos;t load recent activity. Try View all history.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-content-tertiary">No recent activity.</p>
      ) : (
        <div className="flex flex-col">
          {entries.map((entry, idx) => {
            const itemTitle =
              (entry.metadata?.itemTitle as string) ??
              (entry.metadata?.documentTitle as string) ??
              entry.resourceId;
            const actorName = entry.userId ? users[entry.userId] : null;

            return (
              <div
                key={entry.id}
                className={`
                  flex items-start gap-2.5 py-2 px-1
                  ${idx < entries.length - 1 ? "border-b border-edge-subtle" : ""}
                `}
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${actionDotColor(entry.action)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-content-secondary leading-relaxed">
                    <span className="inline-flex items-center gap-1 text-content-tertiary">
                      {actionIcon(entry.action)}
                    </span>{" "}
                    {actorName && (
                      <>
                        <span className="font-medium text-content">{actorName}</span>{" "}
                      </>
                    )}
                    {actionLabel(entry.action)}
                    {itemTitle && (
                      <>
                        {" \u2014 "}
                        <span className="font-medium text-content">
                          {itemTitle}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-content-tertiary tabular-nums shrink-0 mt-0.5">
                  {relativeTime(entry.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ComplianceActivityHistoryModal
        communityId={communityId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
