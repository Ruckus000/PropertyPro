'use client';

/**
 * Leases v3 roster dialogs — shared form pieces.
 *
 * Money parsing, date formatting, the dialog frame, labelled fields with
 * inline errors, radio groups, the term picker and the resident picker. Every
 * dialog in this directory builds on these so the rules (errors only after a
 * submit attempt, 2-decimal money strings, 1st-of-month starts) live once.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Star, X } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ResidentItem } from '@/hooks/use-leases';
import type { ResidentPick } from '@/hooks/use-lease-roster';
import { ApiRequestError } from '@/lib/api/request-json';
import { termEndDate } from '@/lib/leases/lease-state';
import { fold, type PersonRef, type RosterLease, type UnitModel } from '@/lib/leases/roster-model';
import { cn } from '@/lib/utils';

// ── Money ────────────────────────────────────────────────────────────────────

export interface ParsedMoney {
  empty: boolean;
  /** `"1500.00"` — the wire form. Null when empty or invalid. */
  value: string | null;
  amount: number;
  negative: boolean;
}

/** Accepts `1500`, `1,500`, `$1,500.00`. Returns the 2-decimal wire string. */
export function parseMoney(raw: string): ParsedMoney {
  const s = raw.replace(/[$,\s]/g, '');
  if (!s) return { empty: true, value: null, amount: Number.NaN, negative: false };
  if (/^-/.test(s)) return { empty: false, value: null, amount: Number.NaN, negative: true };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { empty: false, value: null, amount: Number.NaN, negative: false };
  const [int = '0', frac = ''] = s.split('.');
  const value = `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`;
  return { empty: false, value, amount: Number(value), negative: false };
}

/** Inline error for a money field, or null. `required` makes empty an error. */
export function moneyError(raw: string, label: string, required: boolean): string | null {
  const p = parseMoney(raw);
  if (p.empty) return required ? `Enter the ${label}, or 0 if there is none.` : null;
  if (p.negative) return `The ${label} cannot be negative.`;
  if (p.value === null) return 'Use numbers only, for example 1850 or 1,850.00.';
  return null;
}

/** `"1500.00"` → `"$1,500.00"`. */
export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** A stored money string as an editable default (`"1500.00"` stays as is). */
export function moneyInput(value: string | null | undefined): string {
  if (value == null) return '';
  const p = parseMoney(value);
  return p.value ?? '';
}

// ── Dates ────────────────────────────────────────────────────────────────────

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isFirstOfMonth(value: string): boolean {
  return isIsoDate(value) && value.endsWith('-01');
}

/** `2026-10-01` → `Oct 1, 2026`. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

// ── People ───────────────────────────────────────────────────────────────────

export function namesOf(people: Array<{ name: string }>): string {
  const names = people.map((p) => p.name);
  if (names.length === 0) return 'No residents';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function unitLabel(model: UnitModel | null): string {
  return model ? `Unit ${model.unit.unitNumber}` : 'Unit';
}

/** The lease's deposit that is still held (no refund or claim recorded yet). */
export function openDeposit(lease: RosterLease | null | undefined) {
  const deposits = lease?.deposits ?? [];
  return [...deposits].reverse().find((d) => !d.disposition) ?? null;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export interface ServerErrorView {
  status: number | null;
  message: string;
  unpaidCount: number | null;
}

export function describeError(error: unknown): ServerErrorView {
  if (error instanceof ApiRequestError) {
    const unpaid = error.details?.['unpaidObligations'];
    return {
      status: error.status,
      message: error.message,
      unpaidCount: Array.isArray(unpaid) ? unpaid.length : null,
    };
  }
  if (error instanceof Error && error.message) return { status: null, message: error.message, unpaidCount: null };
  return { status: null, message: 'Something went wrong. Try again.', unpaidCount: null };
}

export function ServerErrorBanner({ error, action }: { error: ServerErrorView | null; action?: ReactNode }) {
  if (!error) return null;
  const description =
    error.unpaidCount != null && error.unpaidCount > 0
      ? `${error.unpaidCount} unpaid rent ${error.unpaidCount === 1 ? 'charge is' : 'charges are'} open on this lease.`
      : undefined;
  return <AlertBanner status="danger" title={error.message} description={description} action={action} />;
}

// ── Form state ───────────────────────────────────────────────────────────────

export type Errors = Record<string, string | null | undefined>;

export function firstError(errors: Errors): string | null {
  return Object.keys(errors).find((k) => !!errors[k]) ?? null;
}

/**
 * `tried` flips on the first submit attempt; errors show only after that.
 * `guard(errors, ids)` returns true when the form may submit, otherwise moves
 * focus to the first field in error.
 */
export function useSubmitAttempt() {
  const [tried, setTried] = useState(false);
  function guard(errors: Errors, ids: Record<string, string>): boolean {
    const bad = firstError(errors);
    if (!bad) return true;
    setTried(true);
    const id = ids[bad];
    if (id) {
      setTimeout(() => {
        const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
        el?.focus();
      }, 0);
    }
    return false;
  }
  return { tried, guard };
}

// ── Dialog frame ─────────────────────────────────────────────────────────────

export function RosterDialogFrame(props: {
  title: string;
  description: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitVariant?: 'default' | 'destructive';
  pending: boolean;
  cancelLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const { title, description, onClose, onSubmit, submitLabel, submitVariant, pending, cancelLabel, size, children } = props;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size={size ?? 'md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) onSubmit?.();
          }}
        >
          {children}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {cancelLabel ?? 'Cancel'}
            </Button>
            {onSubmit && submitLabel ? (
              <Button type="submit" variant={submitVariant ?? 'default'} disabled={pending} loading={pending}>
                {submitLabel}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────

export interface FieldA11y {
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
}

/** `aria-*` props for the control inside a Field. */
export function fieldA11y(id: string, error: string | null | undefined, show: boolean, hint?: ReactNode): FieldA11y {
  const bad = show && !!error;
  const describedBy = bad ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return { id, 'aria-invalid': bad || undefined, 'aria-describedby': describedBy };
}

export function Field(props: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  /** Shown instead of the hint, in the warning colour, when there is no error. */
  warning?: ReactNode;
  error?: string | null;
  show: boolean;
  children: ReactNode;
}) {
  const { id, label, optional, hint, warning, error, show, children } = props;
  const bad = show && !!error;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-content-tertiary"> (optional)</span> : null}
      </Label>
      {children}
      {bad ? (
        <p id={`${id}-error`} className="text-sm text-status-danger">
          {error}
        </p>
      ) : warning ? (
        <p id={`${id}-hint`} className="text-sm text-status-warning">
          {warning}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-content-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function RadioGroupField<T extends string>(props: {
  name: string;
  legend: string;
  options: Array<RadioOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  hint?: ReactNode;
  show: boolean;
  inline?: boolean;
}) {
  const { name, legend, options, value, onChange, error, hint, show, inline } = props;
  const bad = show && !!error;
  return (
    <fieldset
      className="space-y-2"
      aria-invalid={bad || undefined}
      aria-describedby={bad ? `${name}-error` : hint ? `${name}-hint` : undefined}
    >
      <legend className="mb-2 text-sm font-medium leading-none">{legend}</legend>
      <div className={cn(inline ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2')}>
        {options.map((o, i) => (
          <label key={o.value} className="flex items-start gap-2 text-sm text-content">
            <input
              type="radio"
              id={`${name}-${i}`}
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              {o.label}
              {o.hint ? <span className="block text-content-secondary">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {bad ? (
        <p id={`${name}-error`} className="text-sm text-status-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-sm text-content-secondary">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-edge bg-surface-card px-3 py-1 text-sm text-content shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50';

export function NativeSelect(
  props: FieldA11y & {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
  },
) {
  const { value, onChange, options, placeholder, disabled, ...a11y } = props;
  return (
    <select
      {...a11y}
      className={SELECT_CLASS}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Note({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'warning'
          ? 'border-status-warning-border bg-status-warning-subtle text-content'
          : 'border-edge bg-surface-muted text-content',
      )}
    >
      {children}
    </div>
  );
}

/** Label / value rows for a read-only summary. */
export function Summary({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-edge bg-surface-muted px-3 py-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-content-secondary">{k}</dt>
          <dd className="text-content">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Rent: $0 needs a reason ──────────────────────────────────────────────────

export type ZeroRentReason = 'staff' | 'courtesy_officer' | 'rent_free_agreement' | 'other';

export const ZERO_RENT_OPTIONS: Array<{ value: ZeroRentReason; label: string }> = [
  { value: 'staff', label: 'Staff or on-site employee' },
  { value: 'courtesy_officer', label: 'Courtesy officer' },
  { value: 'rent_free_agreement', label: 'Rent-free agreement' },
  { value: 'other', label: 'Other (explain in notes)' },
];

/** Validates rent + zero reason; returns the errors and the parsed rent. */
export function rentErrors(rent: string, zeroReason: string) {
  const parsed = parseMoney(rent);
  const rentErr = moneyError(rent, 'monthly rent', true);
  const isZero = !rentErr && parsed.amount === 0;
  return {
    parsed,
    isZero,
    rent: rentErr,
    zero: isZero && !zeroReason ? 'Choose why there is no rent.' : null,
  };
}

export function RentFields(props: {
  idPrefix: string;
  rent: string;
  onRent: (v: string) => void;
  zeroReason: string;
  onZeroReason: (v: string) => void;
  errors: { rent: string | null; zero: string | null; isZero: boolean };
  show: boolean;
  hint?: ReactNode;
  label?: string;
}) {
  const { idPrefix, rent, onRent, zeroReason, onZeroReason, errors, show, hint, label } = props;
  const rentId = `${idPrefix}-rent`;
  const zeroId = `${idPrefix}-zero`;
  return (
    <>
      <Field id={rentId} label={label ?? 'Monthly rent'} hint={hint} error={errors.rent} show={show}>
        <Input
          {...fieldA11y(rentId, errors.rent, show, hint)}
          inputMode="decimal"
          autoComplete="off"
          value={rent}
          onChange={(e) => onRent(e.target.value)}
        />
      </Field>
      {errors.isZero ? (
        <Field
          id={zeroId}
          label="Why is there no rent?"
          hint="Saved with the lease record."
          error={errors.zero}
          show={show}
        >
          <NativeSelect
            {...fieldA11y(zeroId, errors.zero, show, true)}
            value={zeroReason}
            onChange={onZeroReason}
            placeholder="Choose a reason"
            options={ZERO_RENT_OPTIONS}
          />
        </Field>
      ) : null}
    </>
  );
}

// ── Term ─────────────────────────────────────────────────────────────────────

export type TermChoice = '6' | '12' | '18' | 'm2m' | 'custom';

export function termFromDates(start: string, end: string | null): TermChoice {
  if (!end) return 'm2m';
  for (const k of ['6', '12', '18'] as const) {
    if (isIsoDate(start) && termEndDate(start, Number(k)) === end) return k;
  }
  return 'custom';
}

/** The lease end date for a term choice, or null (month-to-month / not computable yet). */
export function endDateFor(start: string, term: TermChoice, customEnd: string): string | null {
  if (term === 'm2m') return null;
  if (term === 'custom') return isIsoDate(customEnd) ? customEnd : null;
  return isIsoDate(start) ? termEndDate(start, Number(term)) : null;
}

export function customEndError(start: string, term: TermChoice, customEnd: string): string | null {
  if (term !== 'custom') return null;
  if (!isIsoDate(customEnd)) return 'Enter the last day of the lease.';
  if (isIsoDate(start) && customEnd <= start) return 'Must be after the start date.';
  if (isIsoDate(start) && customEnd > termEndDate(start, 36)) return 'Terms can be up to 36 months.';
  return null;
}

export function TermFields(props: {
  idPrefix: string;
  start: string;
  term: TermChoice;
  onTerm: (t: TermChoice) => void;
  customEnd: string;
  onCustomEnd: (v: string) => void;
  error: string | null;
  show: boolean;
  allowMonthToMonth?: boolean;
}) {
  const { idPrefix, start, term, onTerm, customEnd, onCustomEnd, error, show, allowMonthToMonth = true } = props;
  const options: Array<RadioOption<TermChoice>> = [
    { value: '6', label: '6 months' },
    { value: '12', label: '12 months' },
    { value: '18', label: '18 months' },
    ...(allowMonthToMonth ? [{ value: 'm2m' as const, label: 'Month-to-month' }] : []),
    { value: 'custom', label: 'Custom' },
  ];
  const end = endDateFor(start, term, customEnd);
  const endId = `${idPrefix}-end`;
  return (
    <>
      <RadioGroupField
        name={`${idPrefix}-term`}
        legend="Term"
        options={options}
        value={term}
        onChange={(t) => {
          if (t === 'custom' && !customEnd && isIsoDate(start)) onCustomEnd(termEndDate(start, 12));
          onTerm(t);
        }}
        show={show}
        inline
        hint={term === 'custom' ? undefined : term === 'm2m' ? 'No end date.' : end ? `Ends ${fmtDate(end)}.` : undefined}
      />
      {term === 'custom' ? (
        <Field id={endId} label="Last day of the lease" hint="Up to 36 months." error={error} show={show}>
          <Input
            {...fieldA11y(endId, error, show, true)}
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEnd(e.target.value)}
          />
        </Field>
      ) : null}
    </>
  );
}

// ── Notice days (§83.575) ────────────────────────────────────────────────────

export function noticeDaysError(raw: string): string | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return 'Enter a whole number of days from 0 to 60.';
  const n = Number(raw.trim());
  return n > 60 ? 'Enter a whole number of days from 0 to 60.' : null;
}

export const NOTICE_DAYS_HINT = 'Must match the signed lease. Florida caps this at 60 days (§83.575).';

export function NoticeDaysField(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  show: boolean;
}) {
  const { id, value, onChange, error, show } = props;
  return (
    <Field id={id} label="Notice to leave at term end (days)" hint={NOTICE_DAYS_HINT} error={error} show={show}>
      <Input
        {...fieldA11y(id, error, show, true)}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

// ── Residents picker ─────────────────────────────────────────────────────────

export interface PickedPerson {
  key: string;
  name: string;
  detail: string | null;
  pick: ResidentPick;
}

/** Current lease people → picker entries. */
export function pickedFromPeople(people: PersonRef[]): PickedPerson[] {
  return people.flatMap((p): PickedPerson[] => {
    if (p.userId) return [{ key: `u:${p.userId}`, name: p.name, detail: p.email, pick: { userId: p.userId } }];
    if (p.occupantId != null)
      return [{ key: `c:${p.occupantId}`, name: p.name, detail: 'No email on file', pick: { occupantId: p.occupantId } }];
    return [];
  });
}

/** Picker entries → API residents; the first is primary. */
export function residentPicks(picked: PickedPerson[]): ResidentPick[] {
  return picked.map((p, i) => ({ ...p.pick, isPrimary: i === 0 }));
}

/** A new household member (main's `unit_occupants`) typed in the picker. */
export interface NewOccupantDraft {
  fullName: string;
  phone: string;
  email: string;
}

/** A household member already on file in the Directory for this unit. */
export interface UnitOccupantOption {
  id: number;
  fullName: string;
  email: string | null;
}

export function ResidentsPicker(props: {
  idPrefix: string;
  residents: ResidentItem[];
  picked: PickedPerson[];
  onChange: (next: PickedPerson[]) => void;
  allowWithoutEmail: boolean;
  /** Household members of this unit from the Directory (shown when allowWithoutEmail). */
  occupants?: UnitOccupantOption[];
  error: string | null;
  show: boolean;
  hint: string;
  /** Reports whether the "add a person without email" form is open (unfinished). */
  onDraftOpen?: (open: boolean) => void;
}) {
  const { idPrefix, residents, picked, onChange, allowWithoutEmail, occupants = [], error, show, hint, onDraftOpen } = props;
  const inputId = `${idPrefix}-residents`;
  const listId = `${idPrefix}-residents-list`;
  const uid = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<NewOccupantDraft | null>(null);
  const [draftTried, setDraftTried] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickedKeys = useMemo(() => new Set(picked.map((p) => p.key)), [picked]);
  const matches = useMemo(() => {
    const q = fold(query.trim());
    return residents
      .filter((r) => !pickedKeys.has(`u:${r.id}`))
      .filter((r) => !q || fold(r.name).includes(q) || r.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [residents, pickedKeys, query]);
  const showList = open && query.trim().length > 0;
  const activeIdx = Math.min(active, Math.max(matches.length - 1, 0));

  function choose(r: ResidentItem) {
    onChange([...picked, { key: `u:${r.id}`, name: r.name, detail: r.email, pick: { userId: r.id } }]);
    setQuery('');
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  function setDraftOpen(next: NewOccupantDraft | null) {
    setDraft(next);
    setDraftTried(false);
    onDraftOpen?.(next !== null);
  }

  const draftName = draft && draft.fullName.trim().length === 0 ? 'Enter their full name.' : null;

  function addDraft() {
    if (!draft) return;
    if (draftName) {
      setDraftTried(true);
      return;
    }
    const n = draft.fullName.trim();
    onChange([
      ...picked,
      {
        key: `n:${uid}:${picked.length}:${n}`,
        name: n,
        detail: 'Household member · no portal login',
        pick: {
          newOccupant: {
            fullName: n,
            phone: draft.phone.trim() || null,
            email: draft.email.trim() || null,
          },
        },
      },
    ]);
    setDraftOpen(null);
  }

  function makePrimary(key: string) {
    const p = picked.find((x) => x.key === key);
    if (!p) return;
    onChange([p, ...picked.filter((x) => x.key !== key)]);
  }

  const bad = show && !!error;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Residents</Label>
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Residents on this lease">
          {picked.map((p, i) => (
            <li
              key={p.key}
              className="flex items-center gap-2 rounded-md border border-edge bg-surface-muted py-1 pl-3 pr-1 text-sm"
            >
              <span>
                <span className="font-medium text-content">{p.name}</span>
                <span className="text-content-secondary"> · {i === 0 ? 'Primary' : 'Co-tenant'}</span>
              </span>
              {i > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => makePrimary(p.key)}
                  aria-label={`Make ${p.name} the primary resident`}
                >
                  <Star aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(picked.filter((x) => x.key !== p.key))}
                aria-label={`Remove ${p.name}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches.length > 0 ? `${listId}-${activeIdx}` : undefined}
          aria-invalid={bad || undefined}
          aria-describedby={bad ? `${inputId}-error` : `${inputId}-hint`}
          placeholder={picked.length ? 'Add a co-tenant' : 'Search residents by name or email'}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(activeIdx + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(activeIdx - 1, 0));
            } else if (e.key === 'Enter') {
              if (showList && matches[activeIdx]) {
                e.preventDefault();
                choose(matches[activeIdx]!);
              }
            } else if (e.key === 'Escape' && showList) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching residents"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-edge bg-surface-card py-1 shadow-e3"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-content-secondary">No residents match.</li>
            ) : (
              matches.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    i === activeIdx ? 'bg-surface-hover' : 'bg-surface-card',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                >
                  <span className="block font-medium text-content">{r.name}</span>
                  <span className="block text-content-secondary">{r.email}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {bad ? (
        <p id={`${inputId}-error`} className="text-sm text-status-danger">
          {error}
        </p>
      ) : (
        <p id={`${inputId}-hint`} className="text-sm text-content-secondary">
          {hint}
        </p>
      )}

      {allowWithoutEmail && !draft ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => setDraftOpen({ fullName: '', phone: '', email: '' })}
        >
          Add a person without email
        </Button>
      ) : null}
      {allowWithoutEmail && occupants.some((o) => !pickedKeys.has(`c:${o.id}`)) ? (
        <div className="space-y-1">
          <p className="text-xs text-content-secondary">Household members on file for this unit:</p>
          <div className="flex flex-wrap gap-2">
            {occupants
              .filter((o) => !pickedKeys.has(`c:${o.id}`))
              .map((o) => (
                <Button
                  key={o.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onChange([
                      ...picked,
                      { key: `c:${o.id}`, name: o.fullName, detail: 'Household member · no portal login', pick: { occupantId: o.id } },
                    ])
                  }
                >
                  Add {o.fullName}
                </Button>
              ))}
          </div>
        </div>
      ) : null}
      {draft ? (
        <div className="space-y-3 rounded-md border border-edge bg-surface-muted p-3">
          <p className="text-sm text-content-secondary">
            They are added to this unit’s household in the Directory. Notices go to the unit by mail or hand delivery,
            and they can’t use the resident portal.
          </p>
          <Field id={`${idPrefix}-nc-name`} label="Full name" error={draftName} show={draftTried}>
            <Input
              {...fieldA11y(`${idPrefix}-nc-name`, draftName, draftTried)}
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
            />
          </Field>
          <Field id={`${idPrefix}-nc-phone`} label="Phone" optional show={false}>
            <Input
              id={`${idPrefix}-nc-phone`}
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </Field>
          <Field id={`${idPrefix}-nc-email`} label="Email" optional show={false}>
            <Input
              id={`${idPrefix}-nc-email`}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={addDraft}>
              Add person
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDraftOpen(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Deposit held (§83.49) ────────────────────────────────────────────────────

export type HeldMethod = 'separate_noninterest' | 'separate_interest' | 'surety_bond';

export const HELD_OPTIONS: Array<{ value: HeldMethod; label: string }> = [
  { value: 'separate_noninterest', label: 'Separate account, non-interest-bearing' },
  { value: 'separate_interest', label: 'Separate account, interest-bearing' },
  { value: 'surety_bond', label: 'Surety bond' },
];

export function heldLabel(value: string | null | undefined): string {
  return HELD_OPTIONS.find((o) => o.value === value)?.label ?? 'Not recorded';
}
