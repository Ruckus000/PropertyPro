"use client";

import React, { useState, type ReactNode } from "react";
import { Badge } from "@propertypro/ui";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";

export interface ChecklistItemData {
  id: number;
  templateKey: string;
  title: string;
  description?: string | null;
  category: string;
  statuteReference?: string | null;
  documentId?: number | null;
  documentPostedAt?: string | null; // ISO string
  deadline?: string | null; // ISO string
  rollingWindow?: { months: number } | null;
  isConditional?: boolean;
  isApplicable?: boolean;
  status: ComplianceStatus;
}

// ── Helpers ──────────────────────────────────────────

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusDotColor(status: ComplianceStatus): string {
  switch (status) {
    case "satisfied": return "bg-[var(--status-success)]";
    case "overdue": return "bg-[var(--status-danger)]";
    case "unsatisfied": return "bg-[var(--status-warning)]";
    case "not_applicable": return "bg-[var(--status-neutral)]";
  }
}

function deadlineLabel(item: ChecklistItemData): string | null {
  if (item.status === "satisfied") return "Satisfied";
  if (item.status === "not_applicable") return "N/A";
  if (!item.deadline) return null;
  const days = daysUntil(item.deadline);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d remaining`;
}

function deadlineLabelColor(item: ChecklistItemData): string {
  if (item.status === "satisfied") return "text-status-success";
  if (item.status === "not_applicable") return "text-[var(--status-neutral)]";
  if (!item.deadline) return "text-content-tertiary";
  const days = daysUntil(item.deadline);
  if (days < 0) return "text-status-danger";
  if (days <= 7) return "text-status-warning";
  return "text-content-tertiary";
}

// ── Help Text ────────────────────────────────────────

const HELP_TEXT: Record<string, string> = {
  "718_declaration": "Upload your association's recorded Declaration of Condominium, including any amendments. Typically available from the county recorder's office or your association's attorney.",
  "718_bylaws": "Upload the current bylaws and all adopted amendments. These govern the internal operations of your association.",
  "718_articles": "Upload the Articles of Incorporation filed with the Florida Division of Corporations, including any amendments.",
  "718_rules": "Upload the current rules and regulations adopted by the board. Must be re-posted within 30 days of any changes.",
  "718_qa_sheet": "Upload the Frequently Asked Questions and Answers sheet required by statute. Must cover key topics for prospective buyers.",
  "718_budget": "Upload the current annual budget or the most recently approved budget. Include any amendments.",
  "718_financial_report": "Upload the most recent annual financial report or audit. Certified or compiled by a CPA if required by your declaration.",
  "718_minutes_rolling_12m": "Upload board and owner meeting minutes. A rolling 12-month window of minutes must be maintained on the website.",
  "718_insurance": "Upload current insurance certificates or policies, including property, liability, and fidelity coverage.",
  "718_contracts": "Upload contracts with service providers that are currently in effect. Redact any confidential financial terms if needed.",
  "720_declaration": "Upload the recorded Declaration of Covenants, including all amendments. Available from the county recorder's office.",
  "720_bylaws": "Upload the current bylaws and all adopted amendments governing the HOA's operations.",
  "720_articles": "Upload the Articles of Incorporation filed with the Florida Division of Corporations.",
  "720_budget": "Upload the current or most recently approved annual budget for the association.",
};

// ── Component ────────────────────────────────────────

export interface ComplianceChecklistItemProps {
  item: ChecklistItemData;
  actions?: ReactNode;
}

export function ComplianceChecklistItem({ item, actions }: ComplianceChecklistItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const label = deadlineLabel(item);
  const posted = formatDate(item.documentPostedAt ?? null);
  const deadlineFormatted = formatDate(item.deadline ?? null);

  return (
    <div className="border-b border-edge-subtle last:border-b-0">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`
          group flex w-full items-center gap-3 px-4 py-3
          text-left transition-colors duration-quick
          hover:bg-surface-hover
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-strong)]
          min-h-[48px] cursor-pointer
        `}
      >
        {/* Status dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(item.status)}`} />

        {/* Title */}
        <span className="flex-1 min-w-0 text-sm font-medium text-content truncate" title={item.title}>
          {item.title}
        </span>

        {/* Statute ref */}
        {item.statuteReference && (
          <span className="hidden sm:inline text-xs text-content-tertiary shrink-0">
            {item.statuteReference}
          </span>
        )}

        {/* Deadline/status label */}
        {label && (
          <span className={`text-xs font-medium tabular-nums shrink-0 ${deadlineLabelColor(item)}`}>
            {label}
          </span>
        )}

        {/* Chevron */}
        {expanded ? (
          <ChevronDown size={14} className="text-content-tertiary shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-content-tertiary shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      <div
        className={`
          grid transition-all duration-quick ease-out
          ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
        `}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 ml-5">
          {/* Description */}
          {item.description && (
            <p className="text-sm text-content-secondary leading-relaxed mb-3">
              {item.description}
            </p>
          )}

          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {deadlineFormatted && (
              <Badge variant={item.status === "overdue" ? "danger" : "warning"}>
                Deadline: {deadlineFormatted}
              </Badge>
            )}
            {posted ? (
              <Badge variant="success">Posted: {posted}</Badge>
            ) : (
              <Badge variant="neutral">Not posted</Badge>
            )}
            {item.rollingWindow?.months ? (
              <Badge variant="info">Rolling: {item.rollingWindow.months}mo</Badge>
            ) : null}
            {item.isConditional && (
              <Badge variant="neutral">Conditional</Badge>
            )}
          </div>

          {/* Contextual help */}
          {HELP_TEXT[item.templateKey] && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                aria-label={`What's required for ${item.title}`}
                aria-expanded={showHelp}
                className="flex items-center gap-1.5 text-xs text-[var(--status-info)] hover:underline transition-colors"
              >
                <Info size={12} aria-hidden="true" />
                What&apos;s required?
              </button>
              {showHelp && (
                <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--status-info-bg)] p-3">
                  <p className="text-sm text-[var(--status-info)] leading-relaxed">
                    {HELP_TEXT[item.templateKey]}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {actions && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge-subtle">
              {actions}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComplianceChecklistItem;
