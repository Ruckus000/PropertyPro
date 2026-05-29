import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceStatusHero } from '../compliance-status-hero';
import type { ComplianceSummary } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from '../compliance-checklist-item';

function summary(overrides: Partial<ComplianceSummary> = {}): ComplianceSummary {
  return {
    readiness: { satisfied: 13, applicableTotal: 16, percentage: 81 },
    postingWindowsDueSoonCount: 0,
    overdueCount: 0,
    needsBoardActionCount: 0,
    attentionCount: 0,
    ...overrides,
  };
}

const worst: ChecklistItemData = {
  id: 5, templateKey: '718_insurance', title: 'Insurance', description: null,
  category: 'insurance', statuteReference: null, documentId: null,
  documentPostedAt: null, deadline: null, status: 'overdue',
};

describe('ComplianceStatusHero', () => {
  it('shows a danger verdict and Start-with CTA when overdue', () => {
    const onJump = vi.fn();
    render(<ComplianceStatusHero summary={summary({ overdueCount: 2, attentionCount: 2 })} worstItem={worst} onJumpToWorst={onJump} />);
    expect(screen.getByText(/2 records are overdue/i)).toBeVisible();
    const cta = screen.getByRole('button', { name: /start with: insurance/i });
    fireEvent.click(cta);
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('shows a warning verdict when items need attention but none overdue', () => {
    render(<ComplianceStatusHero summary={summary({ overdueCount: 0, attentionCount: 3, postingWindowsDueSoonCount: 3 })} worstItem={worst} onJumpToWorst={vi.fn()} />);
    expect(screen.getByText(/3 records need your attention/i)).toBeVisible();
  });

  it('shows a success verdict and no CTA when fully compliant', () => {
    render(<ComplianceStatusHero summary={summary()} worstItem={null} onJumpToWorst={vi.fn()} />);
    expect(screen.getByText(/fully compliant/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /start with/i })).toBeNull();
  });

  it('exposes readiness as a progressbar with the right value', () => {
    render(<ComplianceStatusHero summary={summary({ readiness: { satisfied: 4, applicableTotal: 8, percentage: 50 } })} worstItem={null} onJumpToWorst={vi.fn()} />);
    const bar = screen.getByRole('progressbar', { name: /compliance readiness/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/4 of 8 satisfied/i)).toBeVisible();
  });
});
