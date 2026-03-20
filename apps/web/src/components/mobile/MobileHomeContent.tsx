"use client";

import Link from "next/link";
import {
  Megaphone,
  FileText,
  Wrench,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SlideUp,
  StaggerChildren,
  StaggerItem,
  PressScale,
  PageTransition,
} from "@/components/motion";
import { formatShortDate } from "@/lib/utils/format-date";
import { formatMeetingTitle } from "@/lib/utils/format-meeting-title";

// ── Types ───────────────────────────────────────────

interface Announcement {
  id: number;
  title: string;
  isPinned: boolean;
  publishedAt: string;
}

interface Meeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string;
}

interface MobileHomeContentProps {
  firstName: string;
  communityName: string;
  communityId: number;
  timezone: string;
  announcements: Announcement[];
  meetings: Meeting[];
  announcementCount: number;
  pendingSignerCount: number;
}

// ── Quick Actions ───────────────────────────────────

const quickActions = [
  {
    label: "Submit Request",
    icon: Wrench,
    color: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    hrefKey: "maintenance" as const,
  },
  {
    label: "Documents",
    icon: FileText,
    color: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    hrefKey: "documents" as const,
  },
  {
    label: "Payments",
    icon: DollarSign,
    color: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    hrefKey: "payments" as const,
  },
  {
    label: "Meetings",
    icon: CalendarDays,
    color: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
    hrefKey: "meetings" as const,
  },
] as const;

function getHref(key: (typeof quickActions)[number]["hrefKey"], communityId: number) {
  const map = {
    maintenance: `/mobile/maintenance?communityId=${communityId}`,
    documents: `/mobile/documents?communityId=${communityId}`,
    payments: `/mobile/payments?communityId=${communityId}`,
    meetings: `/mobile/meetings?communityId=${communityId}`,
  };
  return map[key];
}

// ── Component ───────────────────────────────────────

export function MobileHomeContent({
  firstName,
  communityName,
  communityId,
  timezone,
  announcements,
  meetings,
  announcementCount,
  pendingSignerCount,
}: MobileHomeContentProps) {
  return (
    <PageTransition>
      <div className="flex flex-col gap-6 pb-6">
        {/* ── Hero Card ── */}
        <SlideUp>
          <div className="mx-4 mt-4 rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-5">
            <p className="text-lg font-semibold text-content">
              Welcome back, {firstName}
            </p>
            <p className="mt-1 text-sm text-content-secondary">{communityName}</p>

            {/* Key stats */}
            <div className="mt-4 flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-2xl font-bold tabular-nums text-content">
                  {announcementCount}
                </span>
                <span className="text-xs text-content-secondary">Announcements</span>
              </div>
              <div className="h-8 w-px bg-edge-subtle" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold tabular-nums text-content">
                  {meetings.length}
                </span>
                <span className="text-xs text-content-secondary">Upcoming</span>
              </div>
              {pendingSignerCount > 0 && (
                <>
                  <div className="h-8 w-px bg-edge-subtle" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold tabular-nums text-status-warning">
                      {pendingSignerCount}
                    </span>
                    <span className="text-xs text-content-secondary">To Sign</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </SlideUp>

        {/* ── Quick Actions Grid ── */}
        <SlideUp delay={0.05}>
          <div className="grid grid-cols-4 gap-3 px-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.hrefKey}
                  href={getHref(action.hrefKey, communityId)}
                  className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] py-3 transition-colors active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      action.color,
                    )}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="text-xs font-medium text-content">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </SlideUp>

        {/* ── Announcements ── */}
        <section>
          <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-content-secondary">
            Announcements
          </h2>
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
                <Megaphone size={24} className="text-content-secondary" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-content">No announcements yet</p>
              <p className="mt-1 text-xs text-content-secondary">
                Check back when your community posts news.
              </p>
            </div>
          ) : (
            <StaggerChildren>
              {announcements.map((a) => (
                <StaggerItem key={a.id}>
                  <PressScale>
                    <Link
                      href={`/mobile/announcements/${a.id}?communityId=${communityId}`}
                      className="mobile-card"
                    >
                      <span className="mobile-card-title">
                        {a.isPinned && (
                          <Pin
                            size={12}
                            className="mr-1.5 inline-block text-content-secondary"
                            aria-label="Pinned"
                          />
                        )}
                        {a.title}
                      </span>
                      <span className="mobile-card-meta">
                        {formatShortDate(a.publishedAt, timezone)}
                      </span>
                      <ChevronRight
                        size={16}
                        className="ml-auto shrink-0 text-content-disabled"
                        aria-hidden="true"
                      />
                    </Link>
                  </PressScale>
                </StaggerItem>
              ))}
            </StaggerChildren>
          )}
        </section>

        {/* ── Upcoming Meetings ── */}
        {meetings.length > 0 && (
          <section>
            <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-content-secondary">
              Upcoming Meetings
            </h2>
            <StaggerChildren>
              {meetings.map((m) => (
                <StaggerItem key={m.id}>
                  <PressScale>
                    <Link
                      href={`/mobile/meetings?communityId=${communityId}`}
                      className="mobile-card"
                    >
                      <span className="mobile-card-title">
                        {formatMeetingTitle(m.title)}
                      </span>
                      <span className="mobile-card-subtitle">{m.meetingType}</span>
                      <span className="mobile-card-meta">
                        {formatShortDate(m.startsAt, timezone)}
                      </span>
                      <ChevronRight
                        size={16}
                        className="ml-auto shrink-0 text-content-disabled"
                        aria-hidden="true"
                      />
                    </Link>
                  </PressScale>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
