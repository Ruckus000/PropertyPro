"use client";

import { Calendar } from "lucide-react";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import {
  PageTransition,
  StaggerChildren,
  StaggerItem,
} from "@/components/motion";
import { formatShortDate } from "@/lib/utils/format-date";

// ── Types ───────────────────────────────────────────

interface SerializedMeeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string;
  location: string | null;
}

interface MobileMeetingsContentProps {
  upcoming: SerializedMeeting[];
  past: SerializedMeeting[];
  timezone: string;
}

// ── Helpers ─────────────────────────────────────────

function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMonthAbbr(iso: string, timezone: string): string {
  return new Date(iso)
    .toLocaleDateString("en-US", { timeZone: timezone, month: "short" })
    .toUpperCase();
}

function getDayOfMonth(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: timezone,
    day: "numeric",
  });
}

function formatMeetingType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ───────────────────────────────────────

export function MobileMeetingsContent({
  upcoming,
  past,
  timezone,
}: MobileMeetingsContentProps) {
  const isEmpty = upcoming.length === 0 && past.length === 0;

  if (isEmpty) {
    return (
      <PageTransition>
        <div className="flex flex-col pb-6">
          <MobileBackHeader title="Meetings" />
          <div className="flex flex-col items-center justify-center px-4 pt-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
              <Calendar size={28} className="text-stone-400" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-stone-900">
              No upcoming meetings
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Meetings will appear here when scheduled.
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        <MobileBackHeader title="Meetings" />

        {/* ── Upcoming Section ── */}
        {upcoming.length > 0 && (
          <section className="mt-4">
            <h2 className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              Upcoming
            </h2>
            <StaggerChildren className="px-4">
              {upcoming.map((m) => (
                <StaggerItem key={m.id}>
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
                    {/* Left: details */}
                    <div className="min-w-0 flex-1 pr-4">
                      <span className="block text-base font-semibold text-stone-900">
                        {m.title}
                      </span>
                      <span className="mt-1 block text-[13px] text-stone-400">
                        {formatMeetingType(m.meetingType)} &middot;{" "}
                        {formatShortDate(m.startsAt, timezone)} at{" "}
                        {formatTime(m.startsAt, timezone)}
                      </span>
                      {m.location && (
                        <span className="mt-0.5 block text-[13px] text-stone-400">
                          {m.location}
                        </span>
                      )}
                    </div>

                    {/* Right: date badge */}
                    <div className="flex-shrink-0 rounded-[10px] border border-stone-200 bg-stone-50 px-3 py-2 text-center">
                      <span className="block text-[11px] font-semibold uppercase text-stone-400">
                        {getMonthAbbr(m.startsAt, timezone)}
                      </span>
                      <span className="block text-[22px] font-bold leading-none text-stone-900">
                        {getDayOfMonth(m.startsAt, timezone)}
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerChildren>
          </section>
        )}

        {/* ── Past Section ── */}
        {past.length > 0 && (
          <section className="mt-4">
            <h2 className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              Past
            </h2>
            <StaggerChildren>
              <ul>
                {past.map((m) => (
                  <StaggerItem key={m.id}>
                    <li className="border-b border-stone-100 px-4 py-4">
                      <span className="block text-[15px] font-medium text-stone-900">
                        {m.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-400">
                        {formatMeetingType(m.meetingType)} &middot;{" "}
                        {formatShortDate(m.startsAt, timezone)}
                      </span>
                      <span className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        Minutes Posted
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
