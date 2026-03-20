"use client";

import Link from "next/link";
import {
  FileText,
  Bell,
  Calendar,
  Wrench,
} from "lucide-react";
import { toInitials } from "@propertypro/shared";
import {
  SlideUp,
  StaggerChildren,
  PageTransition,
} from "@/components/motion";
import { ComplianceCard, SummaryCard } from "@/components/mobile/FeatureCard";
import { MobileNavRow } from "@/components/mobile/MobileNavRow";

// ── Types ───────────────────────────────────────────

interface MobileHomeContentProps {
  userName: string | null;
  communityName: string;
  communityId: number;
  city: string | null;
  state: string | null;
  timezone: string;
  role: string;
  presetKey?: string;
  hasCompliance: boolean;
  hasMeetings: boolean;
  announcementCount: number;
  openMaintenanceCount: number;
  nextMeetingDate: string | null;
}

const ADMIN_PRESETS = new Set([
  "board_member",
  "board_president",
  "cam",
  "site_manager",
  "property_manager_admin",
]);

// ── Component ───────────────────────────────────────

export function MobileHomeContent({
  userName,
  communityName,
  communityId,
  city,
  state,
  timezone,
  role,
  presetKey,
  hasCompliance,
  hasMeetings,
  announcementCount,
  openMaintenanceCount,
  nextMeetingDate,
}: MobileHomeContentProps) {
  const initials = toInitials(userName);
  const location = [city, state].filter(Boolean).join(", ");
  const isAdminRole =
    role === "manager" || role === "pm_admin"
      ? ADMIN_PRESETS.has(presetKey ?? "")
      : false;
  const showCompliance = isAdminRole && hasCompliance;

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        {/* ── Header ── */}
        <SlideUp>
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.5px] text-stone-900">
                {communityName}
              </h1>
              {location && (
                <p className="mt-1.5 text-xs font-medium text-stone-400">
                  {location}
                </p>
              )}
            </div>
            <Link
              href={`/mobile/more?communityId=${communityId}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-stone-200 bg-stone-100 text-sm font-semibold text-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
              aria-label="Profile"
            >
              {initials}
            </Link>
          </div>
        </SlideUp>

        {/* ── Feature Card ── */}
        <SlideUp delay={0.05}>
          {showCompliance ? (
            <ComplianceCard
              communityId={communityId}
              announcementCount={announcementCount}
              openMaintenanceCount={openMaintenanceCount}
              nextMeetingDate={nextMeetingDate}
              timezone={timezone}
            />
          ) : (
            <SummaryCard
              announcementCount={announcementCount}
              openMaintenanceCount={openMaintenanceCount}
              nextMeetingDate={nextMeetingDate}
              timezone={timezone}
            />
          )}
        </SlideUp>

        {/* ── Navigation ── */}
        <div className="mt-6">
          <StaggerChildren>
            <MobileNavRow
              icon={FileText}
              title="Documents"
              description="Budgets, minutes, bylaws"
              href={`/mobile/documents?communityId=${communityId}`}
            />
            <MobileNavRow
              icon={Bell}
              title="Announcements"
              description="Community updates"
              href={`/mobile/announcements?communityId=${communityId}`}
              badge={announcementCount > 0 ? announcementCount : undefined}
            />
            {hasMeetings && (
              <MobileNavRow
                icon={Calendar}
                title="Meetings"
                description="Upcoming schedule"
                href={`/mobile/meetings?communityId=${communityId}`}
              />
            )}
            <MobileNavRow
              icon={Wrench}
              title="Maintenance"
              description="Submit a request"
              href={`/mobile/maintenance?communityId=${communityId}`}
            />
          </StaggerChildren>
        </div>
      </div>
    </PageTransition>
  );
}
