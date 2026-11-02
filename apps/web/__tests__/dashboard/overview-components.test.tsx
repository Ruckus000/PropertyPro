// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { AttentionItem } from '@/lib/dashboard/attention-queue';
import type { AgendaDay } from '@/lib/dashboard/week-agenda';
import type { StatusSentence } from '@/lib/dashboard/status-sentence';
import { StatusHero } from '@/components/dashboard/overview/status-hero';
import { AttentionQueueList } from '@/components/dashboard/overview/attention-queue-list';
import { WeekAgendaList } from '@/components/dashboard/overview/week-agenda-list';
import { QuickActions } from '@/components/dashboard/overview/quick-actions';
import { MetricStrip } from '@/components/dashboard/overview/metric-strip';

const COMMUNITY_ID = 42;

function item(n: number, tier: AttentionItem['tier'] = 'urgent'): AttentionItem {
  return {
    id: `compliance:${n}`,
    kind: 'compliance',
    tier,
    title: `Post item ${n}`,
    detail: `Due Fri Nov ${n}`,
    dueAt: '2026-11-06T17:00:00.000Z',
    action: { label: 'Upload', href: `/communities/${COMMUNITY_ID}/compliance` },
  };
}

const SENTENCE: StatusSentence = {
  tone: 'attention',
  chipLabel: 'Needs attention',
  headline: 'Two things are due this week.',
  body: 'Post the minutes and the budget.',
};

const DAYS: AgendaDay[] = Array.from({ length: 7 }, (_, i) => ({
  dateKey: `2026-11-0${i + 2}`,
  weekdayLabel: `Day ${i + 2}`,
  isToday: i === 0,
  entries: i === 1 ? [{ id: 'm1', label: 'Board meeting', kind: 'event', at: '2026-11-03T23:00:00.000Z' }] : [],
}));

describe('StatusHero', () => {
  it('hero headline is an h2', () => {
    render(<StatusHero sentence={SENTENCE} facts={[{ label: 'Checklist', value: '8 of 10 posted' }]} />);
    expect(screen.getByRole('heading', { level: 2, name: SENTENCE.headline })).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('8 of 10 posted')).toBeInTheDocument();
  });

  it('renders no body paragraph when the body is empty', () => {
    const { container } = render(<StatusHero sentence={{ ...SENTENCE, body: '' }} facts={[]} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('AttentionQueueList', () => {
  it('queue caps at 6 with a View all link to /communities/{id}/compliance', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(i + 1));
    render(<AttentionQueueList items={items} communityId={COMMUNITY_ID} error={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    const link = screen.getByRole('link', { name: 'View all 9 in Compliance' });
    expect(link).toHaveAttribute('href', `/communities/${COMMUNITY_ID}/compliance`);
  });

  it('shows no View all link at 6 or fewer', () => {
    render(<AttentionQueueList items={[item(1)]} communityId={COMMUNITY_ID} error={false} />);
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull();
  });

  it('zero tiers have no chip', () => {
    render(<AttentionQueueList items={[item(1, 'urgent'), item(2, 'urgent')]} communityId={COMMUNITY_ID} error={false} />);
    expect(screen.getByText('2 due this week')).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).toBeNull();
    expect(screen.queryByText(/coming up/i)).toBeNull();
  });

  it('row status has visible text', () => {
    render(<AttentionQueueList items={[item(1, 'critical')]} communityId={COMMUNITY_ID} error={false} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Overdue')).toBeVisible();
    expect(within(row).getByText('Post item 1')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Upload' })).toHaveAttribute('href', `/communities/${COMMUNITY_ID}/compliance`);
  });

  it('coming-up tag and chip use the calm info variant, never the brand (coral) variant', () => {
    const { container } = render(
      <AttentionQueueList items={[item(1, 'critical'), item(2, 'aware')]} communityId={COMMUNITY_ID} error={false} />,
    );
    const chip = screen.getByText('1 coming up').closest('span.inline-flex');
    const tag = within(screen.getAllByRole('listitem')[1]!).getByText('Coming up').closest('span.inline-flex');
    for (const el of [chip, tag]) {
      expect(el).not.toBeNull();
      expect(el!.className).toContain('text-status-info');
      expect(el!.className).not.toContain('status-brand');
    }
    // The red "Overdue" tier is still distinct from the calm one.
    expect(screen.getByText('1 overdue').closest('span.inline-flex')!.className).not.toContain('text-status-info');
    expect(container.innerHTML).not.toContain('status-brand');
  });

  it('row action and View all link meet the touch-target minimums (44px mobile, 36px md+)', () => {
    const items = Array.from({ length: 7 }, (_, i) => item(i + 1));
    render(<AttentionQueueList items={items} communityId={COMMUNITY_ID} error={false} />);
    const action = within(screen.getAllByRole('listitem')[0]!).getByRole('link', { name: 'Upload' });
    expect(action.className).toContain('h-11');
    expect(action.className).toContain('md:h-9');
    const viewAll = screen.getByRole('link', { name: 'View all 7 in Compliance' });
    expect(viewAll.className).toContain('min-h-11');
    expect(viewAll.className).toContain('md:min-h-9');
    expect(viewAll.className).toContain('inline-flex');
  });

  it('empty queue shows the all-set preset', () => {
    render(<AttentionQueueList items={[]} communityId={COMMUNITY_ID} error={false} />);
    expect(screen.getByText("You're all set!")).toBeInTheDocument();
  });

  it('error keeps the rows that loaded, under the banner', () => {
    render(<AttentionQueueList items={[item(1)]} communityId={COMMUNITY_ID} error />);
    expect(screen.getByText(/couldn't load your to-do list/i)).toBeInTheDocument();
    expect(screen.getByText('Post item 1')).toBeInTheDocument();
  });

  it('error with no rows never shows the all-clear empty state', () => {
    render(<AttentionQueueList items={[]} communityId={COMMUNITY_ID} error />);
    expect(screen.getByText(/couldn't load your to-do list/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(/all set|require your attention/i)).toBeNull();
  });

  it('error shows the danger banner', () => {
    render(<AttentionQueueList items={null} communityId={COMMUNITY_ID} error />);
    expect(screen.getByText("We couldn't load your to-do list. Please refresh the page.")).toBeInTheDocument();
  });

  it('null queue renders nothing', () => {
    const { container } = render(<AttentionQueueList items={null} communityId={COMMUNITY_ID} error={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WeekAgendaList', () => {
  it('agenda marks today with aria-current=date', () => {
    render(<WeekAgendaList days={DAYS} />);
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'date')).toHaveLength(1);
    expect(screen.getByText('Board meeting')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing scheduled')).toHaveLength(6);
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
  });

  it('entry labels and weekday labels are 16px (text-base); only metadata stays small', () => {
    render(<WeekAgendaList days={DAYS} />);
    expect(screen.getByText('Board meeting').className).toContain('text-base');
    const today = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'date')!;
    const weekday = today.firstElementChild as HTMLElement;
    expect(weekday.className).toContain('text-base');
    expect(within(today).getByText('Today').className).toContain('text-xs');
  });

  it('error shows the danger banner above days that still render', () => {
    render(<WeekAgendaList days={DAYS} error />);
    expect(screen.getByText("We couldn't load this week's schedule. Please refresh the page.")).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'date')).toHaveLength(1);
    expect(screen.getByText('Board meeting')).toBeInTheDocument();
  });
});

describe('QuickActions', () => {
  it('renders each action as a link', () => {
    render(<QuickActions actions={[{ id: 'a', label: 'New announcement', href: '/announcements/new', icon: 'megaphone' }]} />);
    expect(screen.getByRole('link', { name: 'New announcement' })).toHaveAttribute('href', '/announcements/new');
  });
});

describe('MetricStrip', () => {
  it('metric strip with no tiles renders nothing', () => {
    const { container } = render(<MetricStrip tiles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a KpiCard per tile', () => {
    render(<MetricStrip tiles={[{ id: 'meetings', title: 'Meetings', value: '3', href: '/meetings' }]} />);
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('overview components — axe', () => {
  it('hero + queue + agenda have no violations', async () => {
    const items = [item(1, 'critical'), item(2, 'urgent'), item(3, 'aware')];
    const { container } = render(
      <div>
        <StatusHero sentence={SENTENCE} facts={[{ label: 'Next meeting', value: 'Tue Nov 3' }]} />
        <AttentionQueueList items={items} communityId={COMMUNITY_ID} error={false} />
        <WeekAgendaList days={DAYS} />
      </div>,
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(await axe(container)).toHaveNoViolations();
  });
});
