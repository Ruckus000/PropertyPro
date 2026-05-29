'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@propertypro/ui';
import type { ComplianceSummary } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from './compliance-checklist-item';

export interface ComplianceStatusHeroProps {
  summary: ComplianceSummary;
  worstItem: ChecklistItemData | null;
  onJumpToWorst: () => void;
}

type HeroTone = 'danger' | 'warning' | 'success';

function heroTone(summary: ComplianceSummary): HeroTone {
  if (summary.overdueCount > 0) return 'danger';
  if (summary.attentionCount > 0) return 'warning';
  return 'success';
}

function heroVerdict(summary: ComplianceSummary, tone: HeroTone): string {
  if (tone === 'danger') {
    const n = summary.overdueCount;
    return `${n} ${n === 1 ? 'record is' : 'records are'} overdue. These can expose the association to penalties — start here.`;
  }
  if (tone === 'warning') {
    const n = summary.attentionCount;
    return `${n} ${n === 1 ? 'record needs' : 'records need'} your attention soon.`;
  }
  return "Nothing needs attention right now. Keep it up!";
}

const TONE_STYLES: Record<HeroTone, { border: string; bg: string; fg: string; bar: string }> = {
  danger: { border: 'border-[var(--status-danger)]', bg: 'bg-[var(--status-danger-bg)]', fg: 'text-[var(--status-danger)]', bar: 'bg-[var(--status-danger)]' },
  warning: { border: 'border-[var(--status-warning)]', bg: 'bg-[var(--status-warning-bg)]', fg: 'text-[var(--status-warning)]', bar: 'bg-[var(--interactive-primary)]' },
  success: { border: 'border-[var(--status-success)]', bg: 'bg-[var(--status-success-bg)]', fg: 'text-[var(--status-success)]', bar: 'bg-[var(--status-success)]' },
};

export function ComplianceStatusHero({ summary, worstItem, onJumpToWorst }: ComplianceStatusHeroProps) {
  const tone = heroTone(summary);
  const styles = TONE_STYLES[tone];
  const Icon: LucideIcon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  const pct = summary.readiness.percentage;

  return (
    <section
      aria-labelledby="compliance-hero-title"
      className={cn('rounded-[var(--radius-md)] border-l-4 p-5', styles.border, styles.bg)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={cn('mt-0.5 shrink-0', styles.fg)}>
            <Icon size={24} />
          </span>
          <div>
            <h2 id="compliance-hero-title" className={cn('text-lg font-semibold', styles.fg)}>
              {tone === 'success' ? 'Fully compliant' : 'Action required'}
            </h2>
            <p className="mt-1 text-sm text-content-secondary">{heroVerdict(summary, tone)}</p>
          </div>
        </div>
        {tone !== 'success' && worstItem && (
          <Button variant="primary" size="md" onClick={onJumpToWorst}>
            Start with: {worstItem.title}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-content">Readiness</span>
          <span className="tabular-nums text-content-secondary">
            {summary.readiness.satisfied} of {summary.readiness.applicableTotal} satisfied
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Compliance readiness"
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={cn('h-full', styles.bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}

export default ComplianceStatusHero;
