"use client";

import Link from "next/link";
import {
  Settings,
  DollarSign,
  Wrench,
  FileText,
  CalendarDays,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, SlideUp, StaggerChildren, StaggerItem } from "@/components/motion";

// ── Types ───────────────────────────────────────────

interface MobileMoreContentProps {
  userName: string | null;
  userRole: string;
  communityName: string;
  communityId: number;
}

// ── Link Groups ─────────────────────────────────────

interface MenuLink {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface MenuGroup {
  title: string;
  links: MenuLink[];
}

function getMenuGroups(communityId: number): MenuGroup[] {
  return [
    {
      title: "Community",
      links: [
        { label: "Maintenance", href: `/mobile/maintenance?communityId=${communityId}`, icon: Wrench },
        { label: "Documents", href: `/mobile/documents?communityId=${communityId}`, icon: FileText },
        { label: "Meetings", href: `/mobile/meetings?communityId=${communityId}`, icon: CalendarDays },
        { label: "Compliance", href: `/dashboard/compliance?communityId=${communityId}`, icon: Shield },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Payments", href: `/mobile/payments?communityId=${communityId}`, icon: DollarSign },
        { label: "Settings", href: `/settings?communityId=${communityId}`, icon: Settings },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Help & FAQ", href: `/help?communityId=${communityId}`, icon: HelpCircle },
      ],
    },
  ];
}

// ── Component ───────────────────────────────────────

export function MobileMoreContent({
  userName,
  userRole,
  communityName,
  communityId,
}: MobileMoreContentProps) {
  const menuGroups = getMenuGroups(communityId);

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 pb-6">
        {/* ── Profile Card ── */}
        <SlideUp>
          <div className="mx-4 mt-4 flex items-center gap-4 rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-white">
              <User size={24} aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold text-content">
                {userName ?? "Resident"}
              </span>
              <span className="truncate text-sm text-content-secondary">{userRole}</span>
              <span className="truncate text-xs text-content-tertiary">{communityName}</span>
            </div>
          </div>
        </SlideUp>

        {/* ── Grouped Menu Links ── */}
        {menuGroups.map((group, groupIdx) => (
          <SlideUp key={group.title} delay={0.05 * (groupIdx + 1)}>
            <section>
              <h2 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                {group.title}
              </h2>
              <StaggerChildren>
                <ul className="divide-y divide-edge-subtle dark:divide-edge">
                  {group.links.map((link) => {
                    const Icon = link.icon;
                    return (
                      <StaggerItem key={link.label}>
                        <li>
                          <Link
                            href={link.href}
                            className="flex min-h-[44px] items-center gap-3 px-4 py-3 text-base font-medium text-content transition-colors active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-strong)]"
                          >
                            <Icon
                              size={20}
                              className="shrink-0 text-content-secondary"
                              aria-hidden="true"
                            />
                            <span className="flex-1">{link.label}</span>
                            <ChevronRight
                              size={16}
                              className="shrink-0 text-content-disabled"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      </StaggerItem>
                    );
                  })}
                </ul>
              </StaggerChildren>
            </section>
          </SlideUp>
        ))}

        {/* ── Sign Out ── */}
        <SlideUp delay={0.2}>
          <div className="mx-4">
            <Link
              href="/auth/login"
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)]",
                "border border-status-danger-border bg-status-danger-bg px-4 py-3",
                "text-base font-medium text-status-danger",
                "transition-colors active:opacity-80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-danger",
              )}
            >
              <LogOut size={18} aria-hidden="true" />
              Sign Out
            </Link>
          </div>
        </SlideUp>
      </div>
    </PageTransition>
  );
}
