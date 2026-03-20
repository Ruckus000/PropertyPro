"use client";

import Link from "next/link";
import { User, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import { PageTransition, SlideUp } from "@/components/motion";

interface MobileContactContentProps {
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  isAdmin: boolean;
  communityId: number;
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  isLast,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  href?: string;
  isLast?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        !isLast && "border-b border-stone-100",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100">
        <Icon size={16} className="text-stone-500" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
          {label}
        </div>
        <div className="text-[15px] font-medium text-stone-900">
          {value ?? "Not provided"}
        </div>
      </div>
    </div>
  );

  if (href && value) {
    return (
      <a
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
      >
        {content}
      </a>
    );
  }

  return content;
}

export function MobileContactContent({
  contact,
  isAdmin,
  communityId,
}: MobileContactContentProps) {
  const hasAnyContact = contact.name || contact.email || contact.phone;

  return (
    <PageTransition>
      <MobileBackHeader title="Management Contact" />

      <div className="px-5 py-4">
        {!hasAnyContact ? (
          <SlideUp>
            <div className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center">
              <div className="text-[15px] text-stone-500">
                Contact information hasn&apos;t been added yet.
              </div>
              {isAdmin && (
                <Link
                  href={`/mobile/settings?communityId=${communityId}`}
                  className="mt-3 inline-block text-[15px] font-medium text-stone-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                >
                  Update contact info
                </Link>
              )}
            </div>
          </SlideUp>
        ) : (
          <>
            {/* Contact card */}
            <SlideUp>
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <ContactRow
                  icon={User}
                  label="Contact Name"
                  value={contact.name}
                />
                <ContactRow
                  icon={Mail}
                  label="Email"
                  value={contact.email}
                  href={contact.email ? `mailto:${contact.email}` : undefined}
                />
                <ContactRow
                  icon={Phone}
                  label="Phone"
                  value={contact.phone}
                  href={contact.phone ? `tel:${contact.phone}` : undefined}
                  isLast
                />
              </div>
            </SlideUp>

            {/* Action buttons */}
            <SlideUp delay={0.05}>
              <div className="mt-4 flex gap-3">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex h-11 flex-1 items-center justify-center rounded-xl bg-stone-900 text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
                  >
                    Email
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex h-11 flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white text-[15px] font-medium text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
                  >
                    Call
                  </a>
                )}
              </div>
            </SlideUp>
          </>
        )}
      </div>
    </PageTransition>
  );
}
