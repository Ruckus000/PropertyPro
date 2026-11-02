import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusSentence } from '@/lib/dashboard/status-sentence';

const TONE_STATUS = { critical: 'overdue', attention: 'due_soon', good: 'completed' } as const;

interface StatusHeroProps {
  sentence: StatusSentence;
  facts: { label: string; value: string }[];
}

export function StatusHero({ sentence, facts }: StatusHeroProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-6">
      <StatusBadge status={TONE_STATUS[sentence.tone]} label={sentence.chipLabel} />
      <h2 className="mt-3 font-display text-2xl text-content">{sentence.headline}</h2>
      {sentence.body ? <p className="mt-2 text-base text-content-secondary">{sentence.body}</p> : null}
      {facts.length > 0 ? (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-sm text-content-secondary">{fact.label}</dt>
              <dd className="text-base font-medium text-content">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
