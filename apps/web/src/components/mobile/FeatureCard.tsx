"use client";

import { Check } from "lucide-react";
import { useComplianceChecklist } from "@/hooks/useComplianceChecklist";
import { formatShortDate } from "@/lib/utils/format-date";

// ── Compliance Card (admin roles when hasCompliance is true) ──

interface ComplianceCardProps {
  communityId: number;
  announcementCount: number;
  openMaintenanceCount: number;
  nextMeetingDate: string | null;
  timezone: string;
}

export function ComplianceCard({
  communityId,
  announcementCount,
  openMaintenanceCount,
  nextMeetingDate,
  timezone,
}: ComplianceCardProps) {
  const { data: checklist, isLoading } = useComplianceChecklist(communityId);

  const total = checklist?.length ?? 0;
  const completed = checklist?.filter((item) => item.status === "satisfied").length ?? 0;
  const score = total > 0 ? Math.round((completed / total) * 100) : 0;

  const ringColor = score >= 90 ? "text-green-500 border-green-500" : score >= 70 ? "text-amber-500 border-amber-500" : "text-red-500 border-red-500";
  const ringBg = score >= 90 ? "bg-green-50" : score >= 70 ? "bg-amber-50" : "bg-red-50";

  if (isLoading) {
    return (
      <div className="mx-5 mt-5 animate-pulse rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="h-12 w-24 rounded bg-stone-100" />
        <div className="mt-4 h-px bg-stone-100" />
        <div className="mt-3 flex gap-4">
          <div className="h-8 w-16 rounded bg-stone-100" />
          <div className="h-8 w-16 rounded bg-stone-100" />
          <div className="h-8 w-16 rounded bg-stone-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-5 mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
            Compliance Score
          </div>
          <div className="mt-1 text-4xl font-bold tracking-tight text-stone-900">
            {score}
            <span className="text-xl font-medium text-stone-400">%</span>
          </div>
        </div>
        <div
          className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] ${ringColor} ${ringBg}`}
        >
          <Check size={20} strokeWidth={2.5} />
        </div>
      </div>
      <div className="mt-3 flex gap-4 border-t border-stone-100 pt-3">
        <div>
          <div className="text-lg font-semibold text-stone-900">{announcementCount}</div>
          <div className="text-[11px] text-stone-400">New updates</div>
        </div>
        <div className="w-px bg-stone-200" />
        <div>
          <div className="text-lg font-semibold text-stone-900">{openMaintenanceCount}</div>
          <div className="text-[11px] text-stone-400">Open requests</div>
        </div>
        <div className="w-px bg-stone-200" />
        <div>
          <div className="text-lg font-semibold text-stone-900">
            {nextMeetingDate ? formatShortDate(nextMeetingDate, timezone) : "None"}
          </div>
          <div className="text-[11px] text-stone-400">Next meeting</div>
        </div>
      </div>
    </div>
  );
}

// ── Summary Card (tenant/owner) ──

interface SummaryCardProps {
  announcementCount: number;
  openMaintenanceCount: number;
  nextMeetingDate: string | null;
  timezone: string;
}

export function SummaryCard({
  announcementCount,
  openMaintenanceCount,
  nextMeetingDate,
  timezone,
}: SummaryCardProps) {
  return (
    <div className="mx-5 mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-3">
        Your Summary
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[22px] font-bold text-stone-900">{announcementCount}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">Announcements</div>
        </div>
        <div className="w-px bg-stone-200" />
        <div>
          <div className="text-[22px] font-bold text-stone-900">{openMaintenanceCount}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">Open requests</div>
        </div>
        <div className="w-px bg-stone-200" />
        <div>
          <div className="text-[22px] font-bold text-stone-900">
            {nextMeetingDate ? formatShortDate(nextMeetingDate, timezone) : "None"}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">Next meeting</div>
        </div>
      </div>
    </div>
  );
}
