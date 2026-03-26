'use client';

/**
 * TenantDashboardMockup — branded static mockup of the tenant portal dashboard.
 *
 * Used in demo preview mode to show prospects what their tenants will see.
 * Mirrors the layout of MobileHomeContent but uses hardcoded demo data
 * and inline styles for branding (since CSS var injection may not be available).
 */

import {
  FileText,
  Bell,
  Calendar,
  Wrench,
  ChevronRight,
} from 'lucide-react';

interface TenantDashboardMockupProps {
  communityName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

// ── Mock Nav Row (non-interactive) ──

function MockNavRow({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  badge?: number;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-5">
      <Icon
        size={20}
        className="shrink-0 text-stone-500"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-stone-900">{title}</div>
        <div className="text-[13px] text-stone-400 mt-0.5">{description}</div>
      </div>
      {badge != null && badge > 0 && (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
      <ChevronRight
        size={16}
        className="shrink-0 text-stone-300"
        aria-hidden="true"
      />
    </div>
  );
}

// ── Main Component ──

export function TenantDashboardMockup({
  communityName,
  primaryColor,
  secondaryColor,
  accentColor,
  fontHeading,
  fontBody,
}: TenantDashboardMockupProps) {
  return (
    <div
      className="flex flex-col pb-6 min-h-screen bg-white"
      style={{ fontFamily: `${fontBody}, -apple-system, sans-serif` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <h1
            className="text-[28px] font-bold leading-[1.1] tracking-[-0.5px] text-stone-900"
            style={{ fontFamily: `${fontHeading}, -apple-system, sans-serif` }}
          >
            {communityName}
          </h1>
          <p className="mt-1.5 text-xs font-medium text-stone-400">
            Miami, FL
          </p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
          aria-hidden="true"
        >
          JD
        </div>
      </div>

      {/* Summary Card */}
      <div className="mx-5 mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-3">
          Your Summary
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-[22px] font-bold text-stone-900">3</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Announcements</div>
          </div>
          <div className="w-px bg-stone-200" />
          <div>
            <div className="text-[22px] font-bold text-stone-900">1</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Open requests</div>
          </div>
          <div className="w-px bg-stone-200" />
          <div>
            <div className="text-[22px] font-bold text-stone-900">Jun 12</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Next meeting</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mx-5 mt-4 flex gap-2">
        <div
          className="flex-1 rounded-xl px-3 py-3 text-center text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Pay Rent
        </div>
        <div
          className="flex-1 rounded-xl px-3 py-3 text-center text-xs font-semibold"
          style={{ backgroundColor: accentColor, color: secondaryColor }}
        >
          New Request
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6">
        <MockNavRow
          icon={FileText}
          title="Documents"
          description="Budgets, minutes, bylaws"
        />
        <MockNavRow
          icon={Bell}
          title="Announcements"
          description="Community updates"
          badge={3}
        />
        <MockNavRow
          icon={Calendar}
          title="Meetings"
          description="Upcoming schedule"
        />
        <MockNavRow
          icon={Wrench}
          title="Maintenance"
          description="Submit a request"
        />
      </div>
    </div>
  );
}
