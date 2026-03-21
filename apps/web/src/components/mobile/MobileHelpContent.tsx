"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Phone,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import { PageTransition, SlideUp } from "@/components/motion";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

interface MobileHelpContentProps {
  faqs: FaqItem[];
  isAdmin: boolean;
  communityId: number;
}

function FaqAccordionItem({
  faq,
  isOpen,
  onToggle,
  isLast,
}: {
  faq: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <div className={cn(!isLast && "border-b border-stone-100")}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
      >
        <span className="flex-1 text-[15px] font-medium text-stone-900">
          {faq.question}
        </span>
        {isOpen ? (
          <ChevronUp
            size={16}
            className="shrink-0 text-stone-400"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            size={16}
            className="shrink-0 text-stone-400"
            aria-hidden="true"
          />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-[14px] leading-relaxed text-stone-500">
          {faq.answer}
        </div>
      )}
    </div>
  );
}

export function MobileHelpContent({
  faqs,
  isAdmin,
  communityId,
}: MobileHelpContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q),
    );
  }, [faqs, searchQuery]);

  function toggleFaq(id: number) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <PageTransition>
      <MobileBackHeader title="Help Center" />

      <div className="px-5 py-4">
        {/* Search */}
        <SlideUp>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              size={18}
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-4 text-[15px] text-stone-900 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            />
          </div>
        </SlideUp>

        {/* FAQs */}
        <SlideUp delay={0.05}>
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
              Frequently Asked Questions
            </div>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {filteredFaqs.map((faq, i) => (
                <FaqAccordionItem
                  key={faq.id}
                  faq={faq}
                  isOpen={openId === faq.id}
                  onToggle={() => toggleFaq(faq.id)}
                  isLast={i === filteredFaqs.length - 1}
                />
              ))}
              {filteredFaqs.length === 0 && (
                <div className="px-4 py-8 text-center text-[14px] text-stone-400">
                  No matching questions found
                </div>
              )}
            </div>
          </div>
        </SlideUp>

        {/* Contact card */}
        <SlideUp delay={0.1}>
          <div className="mt-4">
            <Link
              href={`/mobile/help/contact?communityId=${communityId}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100">
                <Phone
                  size={16}
                  className="text-stone-500"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-medium text-stone-900">
                  Management Contact
                </div>
                <div className="text-[13px] text-stone-400">
                  Get in touch with your management team
                </div>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-stone-300"
                aria-hidden="true"
              />
            </Link>
          </div>
        </SlideUp>

        {/* Admin link */}
        {isAdmin && (
          <SlideUp delay={0.15}>
            <div className="mt-4">
              <Link
                href={`/mobile/help/manage?communityId=${communityId}`}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
              >
                <Settings
                  size={18}
                  className="shrink-0 text-stone-500"
                  aria-hidden="true"
                />
                <span className="flex-1 text-[15px] font-medium text-stone-900">
                  Manage FAQs
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-stone-300"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </SlideUp>
        )}
      </div>
    </PageTransition>
  );
}
