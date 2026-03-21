"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface MobileBackHeaderProps {
  title: string;
}

export function MobileBackHeader({ title }: MobileBackHeaderProps) {
  const searchParams = useSearchParams();
  const communityId = searchParams.get("communityId");

  return (
    <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
      <Link
        href={`/mobile${communityId ? `?communityId=${communityId}` : ""}`}
        className="flex h-11 w-11 items-center justify-center -ml-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
        aria-label="Back to Home"
      >
        <ChevronLeft size={20} className="text-stone-900" strokeWidth={2} />
      </Link>
      <h1 className="text-base font-semibold text-stone-900">{title}</h1>
    </header>
  );
}
