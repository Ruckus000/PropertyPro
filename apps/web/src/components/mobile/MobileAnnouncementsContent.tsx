"use client";

import { useMemo } from "react";
import { Bell, Pin } from "lucide-react";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import {
  PageTransition,
  StaggerChildren,
  StaggerItem,
} from "@/components/motion";

// ── Types ───────────────────────────────────────────

interface SerializedAnnouncement {
  id: number;
  title: string;
  isPinned: boolean;
  publishedAt: string;
  source: string;
}

interface MobileAnnouncementsContentProps {
  announcements: SerializedAnnouncement[];
  timezone: string;
}

// ── Helpers ─────────────────────────────────────────

function formatDate(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ───────────────────────────────────────

export function MobileAnnouncementsContent({
  announcements,
  timezone,
}: MobileAnnouncementsContentProps) {
  const { pinned, recent } = useMemo(() => {
    const p: SerializedAnnouncement[] = [];
    const r: SerializedAnnouncement[] = [];
    for (const a of announcements) {
      if (a.isPinned) p.push(a);
      else r.push(a);
    }
    return { pinned: p, recent: r };
  }, [announcements]);

  if (announcements.length === 0) {
    return (
      <PageTransition>
        <div className="flex flex-col pb-6">
          <MobileBackHeader title="Announcements" />
          <div className="flex flex-col items-center justify-center px-4 pt-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
              <Bell size={28} className="text-stone-400" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-stone-900">
              No announcements yet
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Check back for community updates.
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        <MobileBackHeader title="Announcements" />

        {/* ── Pinned Section ── */}
        {pinned.length > 0 && (
          <section className="mt-4">
            <h2 className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              Pinned
            </h2>
            <StaggerChildren>
              <ul>
                {pinned.map((a) => (
                  <StaggerItem key={a.id}>
                    <li className="border-b border-stone-100 px-4 py-4">
                      <div className="flex items-center gap-1 mb-1">
                        <Pin
                          size={12}
                          className="text-amber-600"
                          aria-hidden="true"
                        />
                        <span className="text-[11px] font-medium text-amber-600">
                          Pinned
                        </span>
                      </div>
                      <span className="block text-[15px] font-medium text-stone-900">
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-400">
                        {a.source} &middot; {formatDate(a.publishedAt, timezone)}
                      </span>
                    </li>
                  </StaggerItem>
                ))}
              </ul>
            </StaggerChildren>
          </section>
        )}

        {/* ── Recent Section ── */}
        {recent.length > 0 && (
          <section className={pinned.length > 0 ? "mt-4" : "mt-4"}>
            <h2 className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              Recent
            </h2>
            <StaggerChildren>
              <ul>
                {recent.map((a) => (
                  <StaggerItem key={a.id}>
                    <li className="border-b border-stone-100 px-4 py-4">
                      <span className="block text-[15px] font-medium text-stone-900">
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-400">
                        {a.source} &middot; {formatDate(a.publishedAt, timezone)}
                      </span>
                    </li>
                  </StaggerItem>
                ))}
              </ul>
            </StaggerChildren>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
