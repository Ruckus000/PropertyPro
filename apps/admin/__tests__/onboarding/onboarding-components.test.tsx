// @vitest-environment jsdom
/**
 * The onboarding board's components.
 *
 * These cases carry the weight a browser check would normally carry: the
 * preview tooling runs in the ORIGINAL checkout, not this worktree, so nobody
 * has looked at this page. What can be asserted structurally is asserted here —
 * the responsive contract in particular, since `md:` classes never resolve in
 * jsdom and the only honest thing to check is which classes are EMITTED.
 *
 * The cases are the ones that are easy to get wrong and invisible when they are:
 *
 * - a blocked card must be readable without colour (icon + text, not a tint).
 * - the mobile segmented control must keep all four columns in the DOM, so a
 *   desktop reader whose JavaScript never runs still sees the whole board.
 * - the progress bar's width must be an inline STYLE — `w-[${pct}%]` is
 *   assembled at runtime and Tailwind emits no rule for it, so every bar would
 *   silently render at zero width.
 * - an empty checklist must say setup has not started, never render an empty
 *   list that reads as "no steps required".
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PipelineBoard } from '@/components/onboarding/PipelineBoard';
import { PipelineCardTile } from '@/components/onboarding/PipelineCard';
import { StageColumn } from '@/components/onboarding/StageColumn';
import { TrialChecklist } from '@/components/onboarding/TrialChecklist';
import type { PipelineCard, Stage } from '@/lib/server/onboarding';

function card(over: Partial<PipelineCard> & { id: string; stage: Stage }): PipelineCard {
  return {
    name: 'Pelican Bay',
    meta: 'Day 11 of trial',
    pct: 50,
    steps: '1/2',
    blocker: null,
    next: 'Owner roster imported',
    href: '/clients/3',
    occurredAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

const emptyStages: Record<Stage, PipelineCard[]> = {
  lead: [],
  demo: [],
  trial: [],
  active: [],
};

describe('PipelineCardTile', () => {
  it('states a blocker in words and a shape, not only a colour', () => {
    const { container } = render(
      <ul>
        <PipelineCardTile card={card({ id: 'a', stage: 'demo', blocker: 'Demo stale in 6 days' })} />
      </ul>,
    );
    expect(screen.getByText('Demo stale in 6 days')).toBeTruthy();
    // An icon accompanies it, and it is hidden from assistive tech because the
    // text beside it already says everything the icon says.
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeTruthy();
  });

  it('renders no blocker line at all when there is nothing in the way', () => {
    render(
      <ul>
        <PipelineCardTile card={card({ id: 'a', stage: 'lead', blocker: null })} />
      </ul>,
    );
    expect(screen.queryByText(/stale|not claimed|Trial ends/)).toBeNull();
  });

  it('drives the progress bar with an inline width, not an assembled class', () => {
    const { container } = render(
      <ul>
        <PipelineCardTile card={card({ id: 'a', stage: 'trial', pct: 40 })} showProgress />
      </ul>,
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
    expect(bar!.getAttribute('aria-valuenow')).toBe('40');
    expect(bar!.getAttribute('aria-valuemin')).toBe('0');
    expect(bar!.getAttribute('aria-valuemax')).toBe('100');
    const fill = bar!.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('40%');
    // Nothing anywhere carries a runtime-assembled arbitrary width class.
    expect(container.innerHTML).not.toContain('w-[40%]');
  });

  it('omits the progress bar for stages that have no checklist behind them', () => {
    const { container } = render(
      <ul>
        <PipelineCardTile card={card({ id: 'a', stage: 'lead' })} />
      </ul>,
    );
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('links only the name, so the card is one target and not a paragraph-sized one', () => {
    render(
      <ul>
        <PipelineCardTile card={card({ id: 'a', stage: 'trial', href: '/clients/77' })} showProgress />
      </ul>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/clients/77');
    expect(links[0]!.textContent).toBe('Pelican Bay');
  });
});

describe('StageColumn', () => {
  it('says a stage is empty rather than rendering a bare heading', () => {
    render(<StageColumn stage="demo" label="Demos" cards={[]} selectedOnMobile />);
    expect(screen.getByText('Nothing at this stage.')).toBeTruthy();
  });

  it('counts its blocked cards in the heading row', () => {
    render(
      <StageColumn
        stage="trial"
        label="Trials"
        selectedOnMobile
        cards={[
          card({ id: 'a', stage: 'trial', blocker: 'Root manager not claimed' }),
          card({ id: 'b', stage: 'trial' }),
        ]}
      />,
    );
    expect(screen.getByText('1 blocked')).toBeTruthy();
  });

  it('is hidden below md when it is not the selected stage, and visible from md up', () => {
    const { container, rerender } = render(
      <StageColumn stage="demo" label="Demos" cards={[]} selectedOnMobile={false} />,
    );
    const section = container.querySelector('section')!;
    // jsdom applies no media queries, so the CLASSES are the contract.
    expect(section.className).toContain('hidden');
    expect(section.className).toContain('md:block');

    rerender(<StageColumn stage="demo" label="Demos" cards={[]} selectedOnMobile />);
    expect(container.querySelector('section')!.className).toContain('block');
  });
});

describe('PipelineBoard', () => {
  const stages: Record<Stage, PipelineCard[]> = {
    lead: [card({ id: 'lead-1', stage: 'lead', name: 'Oceanview' })],
    demo: [card({ id: 'demo-1', stage: 'demo', name: 'Palmetto', blocker: 'Demo stale in 6 days' })],
    trial: [card({ id: 'trial-1', stage: 'trial', name: 'Pelican Bay' })],
    active: [card({ id: 'active-1', stage: 'active', name: 'Harbor Lights' })],
  };

  it('keeps every column in the DOM so a desktop reader needs no JavaScript', () => {
    render(<PipelineBoard stages={stages} />);
    for (const name of ['Oceanview', 'Palmetto', 'Pelican Bay', 'Harbor Lights']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('announces which stage is selected rather than only tinting it', () => {
    render(<PipelineBoard stages={stages} />);
    const leads = screen.getByRole('button', { name: /Leads/ });
    const demos = screen.getByRole('button', { name: /Demos/ });
    expect(leads.getAttribute('aria-pressed')).toBe('true');
    expect(demos.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(demos);
    expect(demos.getAttribute('aria-pressed')).toBe('true');
    expect(leads.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches which column is shown below md', () => {
    const { container } = render(<PipelineBoard stages={stages} />);
    const columnFor = (stage: Stage) =>
      container.querySelector(`section[aria-labelledby="pipeline-stage-${stage}"]`)!;

    expect(columnFor('lead').className).toContain('block');
    expect(columnFor('demo').className).toContain('hidden');

    fireEvent.click(screen.getByRole('button', { name: /Demos/ }));
    expect(columnFor('lead').className).toContain('hidden');
    expect(columnFor('demo').className).toContain('block');
  });

  it('gives the stage buttons a 44 px minimum touch target', () => {
    // The control only exists below `md`, where design.md's 44 px mobile floor
    // applies — not the 36 px desktop allowance.
    render(<PipelineBoard stages={emptyStages} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-11');
    }
  });

  it('lays the columns out one-up, two-up, then four-up', () => {
    const { container } = render(<PipelineBoard stages={emptyStages} />);
    const grid = container.querySelector('.grid')!;
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    // No base `grid-cols-*`: one column is the default, which is what 390 px
    // wants and what the segmented control above assumes.
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-/);
  });
});

describe('TrialChecklist', () => {
  const checklist = {
    communityId: 3,
    name: 'Pelican Bay',
    trialEndsAt: '2026-09-12T00:00:00Z',
    items: [
      { key: 'root_claimed', label: 'Root claimed', done: true, meta: 'Done' },
      { key: 'owner_roster_imported', label: 'Owner roster imported', done: false, meta: 'Not started' },
    ],
  };

  it('states done-ness in words beside each step', () => {
    render(<TrialChecklist checklist={checklist} endsAtLabel="Trial ends in 4 days" />);
    const done = screen.getByText('Root claimed').closest('li')!;
    expect(within(done).getByText('Done')).toBeTruthy();
    const todo = screen.getByText('Owner roster imported').closest('li')!;
    expect(within(todo).getByText('Not started')).toBeTruthy();
  });

  it('summarises progress and the countdown together', () => {
    render(<TrialChecklist checklist={checklist} endsAtLabel="Trial ends in 4 days" />);
    expect(screen.getByText(/1 of 2 steps complete · Trial ends in 4 days/)).toBeTruthy();
  });

  it('drops the countdown when the trial is not ending soon', () => {
    render(<TrialChecklist checklist={checklist} endsAtLabel={null} />);
    expect(screen.getByText('1 of 2 steps complete')).toBeTruthy();
  });

  it('says setup has not started rather than rendering an empty list', () => {
    render(<TrialChecklist checklist={{ ...checklist, items: [] }} endsAtLabel={null} />);
    expect(screen.getByText(/setup has not started/)).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
