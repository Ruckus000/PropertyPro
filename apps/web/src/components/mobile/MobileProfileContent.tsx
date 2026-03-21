"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User,
  Lock,
  HelpCircle,
  MessageSquare,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { toInitials } from "@propertypro/shared";
import { createBrowserClient } from "@/lib/supabase/client";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import { PageTransition, SlideUp } from "@/components/motion";

interface MobileProfileContentProps {
  userName: string | null;
  userRole: string;
  communityName: string;
  communityId: number;
}

interface SettingsRowProps {
  icon: React.ElementType;
  label: string;
  href?: string;
  isLast?: boolean;
}

function SettingsRow({ icon: Icon, label, href, isLast }: SettingsRowProps) {
  const className = `flex items-center gap-3 px-4 py-3.5 ${
    isLast ? "" : "border-b border-stone-100"
  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400`;

  if (!href) {
    return (
      <div className={`${className} opacity-50`}>
        <Icon size={18} className="shrink-0 text-stone-500" strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1 text-[15px] font-medium text-stone-900">{label}</span>
        <span className="text-[11px] text-stone-400">Coming soon</span>
      </div>
    );
  }

  return (
    <Link href={href} className={className}>
      <Icon size={18} className="shrink-0 text-stone-500" strokeWidth={1.8} aria-hidden="true" />
      <span className="flex-1 text-[15px] font-medium text-stone-900">{label}</span>
      <ChevronRight size={16} className="shrink-0 text-stone-300" aria-hidden="true" />
    </Link>
  );
}

export function MobileProfileContent({
  userName,
  userRole,
  communityName,
  communityId,
}: MobileProfileContentProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const initials = toInitials(userName);

  async function handleSignOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  return (
    <PageTransition>
      <MobileBackHeader title="Profile" />

      {/* Profile card */}
      <SlideUp>
        <div className="flex flex-col items-center py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-stone-200 bg-stone-100 text-[22px] font-semibold text-stone-500">
            {initials}
          </div>
          <div className="mt-3 text-xl font-semibold text-stone-900">
            {userName ?? "Resident"}
          </div>
          <div className="mt-1 text-[13px] text-stone-400">{userRole}</div>
          <div className="text-[13px] text-stone-400">{communityName}</div>
        </div>
      </SlideUp>

      {/* Account group */}
      <SlideUp delay={0.05}>
        <div className="px-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-2">
            Account
          </div>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <SettingsRow
              icon={User}
              label="Edit Profile"
              href={`/mobile/settings?communityId=${communityId}`}
            />
            <SettingsRow
              icon={Lock}
              label="Security"
              href={`/mobile/settings/security?communityId=${communityId}`}
              isLast
            />
          </div>
        </div>
      </SlideUp>

      {/* Support group */}
      <SlideUp delay={0.1}>
        <div className="px-5 mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-2">
            Support
          </div>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <SettingsRow
              icon={HelpCircle}
              label="Help Center"
              href={`/mobile/help?communityId=${communityId}`}
            />
            <SettingsRow
              icon={MessageSquare}
              label="Contact Management"
              href={`/mobile/help/contact?communityId=${communityId}`}
              isLast
            />
          </div>
        </div>
      </SlideUp>

      {/* Sign out */}
      <SlideUp delay={0.15}>
        <div className="px-5 mt-6 pb-6">
          <button
            onClick={handleSignOut}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 py-3.5 text-[15px] font-medium text-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
          >
            <LogOut size={18} aria-hidden="true" />
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </SlideUp>
    </PageTransition>
  );
}
