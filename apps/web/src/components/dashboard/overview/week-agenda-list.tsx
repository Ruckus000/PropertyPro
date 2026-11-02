import { AlertBanner } from '@/components/shared/alert-banner';
import type { AgendaDay } from '@/lib/dashboard/week-agenda';

export function WeekAgendaList({ days, error = false }: { days: AgendaDay[]; error?: boolean }) {
  return (
    <section aria-labelledby="this-week-heading" className="space-y-4">
      <h3 id="this-week-heading" className="text-lg font-semibold text-content">
        This week
      </h3>
      {error ? (
        <AlertBanner status="danger" title="We couldn't load this week's schedule. Please refresh the page." />
      ) : null}
      <ol className="divide-y divide-edge rounded-md border border-edge bg-surface-card">
        {days.map((day) => (
          <li
            key={day.dateKey}
            aria-current={day.isToday ? 'date' : undefined}
            className={day.isToday ? 'flex gap-4 bg-surface-muted p-4' : 'flex gap-4 p-4'}
          >
            <span className="w-20 shrink-0 text-base font-medium text-content">
              {day.weekdayLabel}
              {day.isToday ? <span className="block text-xs text-content-secondary">Today</span> : null}
            </span>
            {day.entries.length === 0 ? (
              <span className="text-sm text-content-secondary">Nothing scheduled</span>
            ) : (
              <ul className="space-y-1">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="text-base text-content">
                    {entry.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
