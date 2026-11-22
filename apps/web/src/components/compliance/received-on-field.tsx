'use client';

/**
 * "Received or created on": when the association received or created a
 * record. The website's 30-day posting clock runs from this date
 * (§718.111(12)(g)1., audit 2026-11-05 H-2). Defaults to today; never later.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toDateInputValue } from '@/lib/compliance/received-on-input';

export function ReceivedOnField({
  id,
  value,
  onChange,
  disabled,
  label = 'Received or created on',
  hint = 'The 30-day posting window starts on this date.',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-content-secondary">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        max={toDateInputValue(new Date())}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={hintId}
        required
      />
      <p id={hintId} className="text-xs text-content-tertiary">
        {hint}
      </p>
    </div>
  );
}
