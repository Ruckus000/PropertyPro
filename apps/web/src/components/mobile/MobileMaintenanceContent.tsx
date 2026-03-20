"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import {
  PageTransition,
  StaggerChildren,
  StaggerItem,
} from "@/components/motion";
import { formatShortDate } from "@/lib/utils/format-date";

// ── Types ───────────────────────────────────────────

interface SerializedRequest {
  id: number;
  title: string;
  status: string;
  createdAt: string;
}

interface MobileMaintenanceContentProps {
  requests: SerializedRequest[];
  timezone: string;
  communityId: number;
}

// ── Status helpers ──────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-600",
  submitted: "bg-amber-50 text-amber-600",
  in_progress: "bg-blue-50 text-blue-600",
  acknowledged: "bg-blue-50 text-blue-600",
  resolved: "bg-emerald-50 text-emerald-600",
  closed: "bg-stone-100 text-stone-500",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  submitted: "Submitted",
  in_progress: "In Progress",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  closed: "Closed",
};

function getStatusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-stone-100 text-stone-500";
}

function getStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

// ── Component ───────────────────────────────────────

export function MobileMaintenanceContent({
  requests,
  timezone,
  communityId,
}: MobileMaintenanceContentProps) {
  if (requests.length === 0) {
    return (
      <PageTransition>
        <div className="flex flex-col pb-6">
          <MobileBackHeader title="Maintenance" />

          {/* Submit button */}
          <div className="mx-5 mt-4">
            <Link
              href={`/mobile/maintenance/new?communityId=${communityId}`}
              className="flex h-11 w-full items-center justify-center rounded-md bg-stone-900 text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
            >
              Submit Request
            </Link>
          </div>

          <div className="flex flex-col items-center justify-center px-4 pt-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
              <Wrench size={28} className="text-stone-400" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-stone-900">
              No maintenance requests yet
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Submit your first request
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        <MobileBackHeader title="Maintenance" />

        {/* Submit button */}
        <div className="mx-5 mt-4">
          <Link
            href={`/mobile/maintenance/new?communityId=${communityId}`}
            className="flex h-11 w-full items-center justify-center rounded-md bg-stone-900 text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          >
            Submit Request
          </Link>
        </div>

        {/* Request list */}
        <section className="mt-4">
          <StaggerChildren>
            <ul>
              {requests.map((r) => (
                <StaggerItem key={r.id}>
                  <li className="border-b border-stone-100 px-4 py-4">
                    <span className="block text-[15px] font-medium text-stone-900">
                      {r.title}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${getStatusStyle(r.status)}`}
                      >
                        {getStatusLabel(r.status)}
                      </span>
                      <span className="text-xs text-stone-400">
                        {formatShortDate(r.createdAt, timezone)}
                      </span>
                    </div>
                  </li>
                </StaggerItem>
              ))}
            </ul>
          </StaggerChildren>
        </section>
      </div>
    </PageTransition>
  );
}
