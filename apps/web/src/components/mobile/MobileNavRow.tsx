"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { PressScale, StaggerItem } from "@/components/motion";

interface MobileNavRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  badge?: number;
}

export function MobileNavRow({ icon: Icon, title, description, href, badge }: MobileNavRowProps) {
  return (
    <StaggerItem>
      <PressScale>
        <Link
          href={href}
          className="flex items-center gap-3 border-b border-stone-100 px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
        >
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
        </Link>
      </PressScale>
    </StaggerItem>
  );
}
