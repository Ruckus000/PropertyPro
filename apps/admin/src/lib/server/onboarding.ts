/**
 * The onboarding pipeline (spec D21): four stages derived from four existing
 * sources of truth — marketing leads, demo instances, trialing communities and
 * their onboarding checklists.
 *
 * Nothing here is stored. There is no `pipeline_stage` column and there should
 * not be one: a stage is a QUESTION about rows that already exist, and a stored
 * copy is a second answer that drifts from the first. That shape is the same one
 * `lib/server/signals/*` uses.
 *
 * ## Why the derivation is a separate pure function
 *
 * `deriveStages` takes already-fetched rows plus an injected `now` and returns
 * the board. Every rule worth getting wrong lives there — the stale-demo
 * countdown, the checklist arithmetic, the blocker precedence — and all of them
 * are functions of a date, which is precisely what a query-level test cannot
 * pin down. `getPipeline` is then only the reads.
 *
 * ## Conversion is DERIVED, not a column
 *
 * `demo_instances` has no `is_converted` column. A demo counts as converted once
 * the community it seeded has had its `is_demo` flag cleared — the same rule
 * `lib/db/demo-queries.ts` applies, restated here over a narrower projection
 * because this screen has no business reading `auth_token_secret`.
 *
 * @module lib/server/onboarding
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';
import { labelForSource } from '@/lib/server/leads';
import {
  STALE_DEMO_ORANGE_THRESHOLD_DAYS,
  STALE_DEMO_RED_THRESHOLD_DAYS,
} from '@/lib/utils/stale-badge';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export type Stage = 'lead' | 'demo' | 'trial' | 'active';

export const STAGES: readonly Stage[] = ['lead', 'demo', 'trial', 'active'];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Leads',
  demo: 'Demos',
  trial: 'Trials',
  active: 'Newly active',
};

/** One tile on the board. Every field is a finished string — the view formats nothing. */
export interface PipelineCard {
  id: string;
  stage: Stage;
  name: string;
  meta: string;
  /** 0-100. Only the trial stage has real progress; the rest are 0 or 100. */
  pct: number;
  /** `"1/2"`, or `''` for a stage with no checklist behind it. */
  steps: string;
  /** The one thing in this card's way, or `null`. Drives the signal count. */
  blocker: string | null;
  next: string;
  href: string;
  /** ISO. The row's own event time, never the read time. */
  occurredAt: string;
}

export interface PipelineChecklist {
  communityId: number;
  name: string;
  trialEndsAt: string | null;
  items: { key: string; label: string; done: boolean; meta: string }[];
}

export interface Pipeline {
  stages: Record<Stage, PipelineCard[]>;
  checklist: PipelineChecklist | null;
  /** ISO — when these reads happened. Rendered so a stale tab cannot lie. */
  generatedAt: string;
}

// ─── Derivation input ────────────────────────────────────────────────────────

export interface LeadInput {
  id: number;
  association_name: string | null;
  unit_count: number | null;
  source: string;
  status: string;
  created_at: string;
}

export interface DemoInput {
  id: number;
  prospect_name: string;
  created_at: string;
  /** Derived by the caller from the seeded community's `is_demo` — not a column. */
  is_converted: boolean;
}

export interface ChecklistInput {
  item_key: string;
  completed_at: string | null;
}

export interface TrialInput {
  id: number;
  name: string;
  created_at: string;
  subscription_current_period_end_at: string | null;
  hasRoot: boolean;
  checklist: ChecklistInput[];
}

export interface ActiveInput {
  id: number;
  name: string;
  created_at: string;
}

export interface DeriveInput {
  leads: LeadInput[];
  demos: DemoInput[];
  trials: TrialInput[];
  active: ActiveInput[];
}

// ─── Small shared helpers ────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Statuses that are still in the funnel. `disqualified` is not a pipeline stage. */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'qualified'] as const;

/** A community counts as "newly active" for this many days after it was created. */
export const NEWLY_ACTIVE_WINDOW_DAYS = 30;

/** How close the period end has to be before it becomes a blocker. */
export const TRIAL_ENDING_SOON_DAYS = 7;

/**
 * Whole elapsed days, floored, never negative.
 *
 * Elapsed milliseconds rather than `differenceInDays`, which is a LOCAL-CALENDAR
 * diff and is off by one across a DST boundary — the trap recorded in
 * `date_fns_local_calendar_dst_trap`. A demo one day short of the stale
 * threshold rendering as stale is a number an operator would act on.
 */
function daysBetween(fromIso: string, now: Date): number {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / MS_PER_DAY));
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/**
 * `owner_roster_imported` → `Owner roster imported`.
 *
 * Deliberately NOT a lookup against `CHECKLIST_DISPLAY` in apps/web: that map is
 * a per-ROLE copy deck ("Upload your first compliance document") addressed to
 * the person doing the task, and the admin board is a third party reading over
 * their shoulder. A key the web app adds tomorrow also has to render here, and a
 * lookup would render it blank.
 */
export function humanizeItemKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  if (words.length === 0) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What to do with a lead, by where it already got to. */
const LEAD_NEXT: Record<string, string> = {
  new: 'Reply & offer a demo',
  contacted: 'Follow up',
  qualified: 'Create demo',
};

// ─── Per-stage rules ─────────────────────────────────────────────────────────

function leadCard(lead: LeadInput, _now: Date): PipelineCard {
  const units =
    lead.unit_count === null ? 'Unit count unknown' : plural(lead.unit_count, 'unit');
  return {
    id: `lead-${lead.id}`,
    stage: 'lead',
    name: lead.association_name ?? 'Unnamed association',
    meta: `${units} · ${labelForSource(lead.source)}`,
    pct: 0,
    steps: '',
    // A lead is not blocked, it is un-worked. Giving every untouched lead a
    // blocker would make the nav badge a count of the whole funnel.
    blocker: null,
    next: LEAD_NEXT[lead.status] ?? 'Triage',
    href: `/leads?status=${lead.status}`,
    occurredAt: lead.created_at,
  };
}

/**
 * The stale-demo countdown, read off `stale-badge.ts` rather than written as
 * literals, so moving a threshold moves the badge on `/demo` and this blocker
 * together.
 *
 * Past the red threshold there is no countdown left to run: subtracting would
 * render "stale in -5 days", so it states the age instead.
 */
export function demoBlocker(age: number): string | null {
  if (age >= STALE_DEMO_RED_THRESHOLD_DAYS) {
    return `Demo is stale — ${plural(age, 'day')} old`;
  }
  if (age >= STALE_DEMO_ORANGE_THRESHOLD_DAYS) {
    return `Demo stale in ${plural(STALE_DEMO_RED_THRESHOLD_DAYS - age, 'day')}`;
  }
  return null;
}

function demoCard(demo: DemoInput, now: Date): PipelineCard {
  const age = daysBetween(demo.created_at, now);
  return {
    id: `demo-${demo.id}`,
    stage: 'demo',
    name: demo.prospect_name,
    meta: `Demo day ${age}`,
    pct: 0,
    steps: '',
    blocker: demoBlocker(age),
    next: 'Convert to trial or archive',
    href: '/demo',
    occurredAt: demo.created_at,
  };
}

/**
 * Collapse checklist rows to one entry PER KEY, in first-seen order.
 *
 * `onboarding_checklist_items` is UNIQUE on (community_id, user_id, item_key) —
 * one row per member per step — so a five-member community holds five rows for
 * `add_units`. Counting rows would report a two-step community as "2/10" and
 * make the progress bar a function of headcount. A step is done when SOMEBODY
 * did it, which is what "this community has added its units" means.
 */
export function collapseChecklist(rows: ChecklistInput[]): { key: string; done: boolean }[] {
  const byKey = new Map<string, boolean>();
  for (const row of rows) {
    byKey.set(row.item_key, (byKey.get(row.item_key) ?? false) || row.completed_at !== null);
  }
  return [...byKey].map(([key, done]) => ({ key, done }));
}

/**
 * The trial countdown — `null` outside the seven-day window, because a trial
 * three weeks out is not something anybody can act on today.
 *
 * `Math.ceil` on the remaining milliseconds, not `Math.floor`: with 4.5 days
 * left a floor says "3 days", and a countdown that under-reports is one an
 * operator acts on a day late.
 */
export function trialBlocker(endsAt: string | null, now: Date): string | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  const remainingMs = end - now.getTime();
  if (remainingMs < 0) return 'Trial has ended';
  const days = Math.ceil(remainingMs / MS_PER_DAY);
  if (days === 0) return 'Trial ends today';
  if (days > TRIAL_ENDING_SOON_DAYS) return null;
  return `Trial ends in ${plural(days, 'day')}`;
}

function trialCard(row: TrialInput, now: Date): PipelineCard {
  const items = collapseChecklist(row.checklist);
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const firstIncomplete = items.find((i) => !i.done);

  return {
    id: `trial-${row.id}`,
    stage: 'trial',
    name: row.name,
    meta: `Day ${daysBetween(row.created_at, now)} of trial`,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    steps: `${done}/${total}`,
    // Precedence, not a list: an unclaimed root is the reason the checklist is
    // not moving, so surfacing the countdown over it would name the symptom.
    blocker: row.hasRoot ? trialBlocker(row.subscription_current_period_end_at, now) : 'Root manager not claimed',
    next:
      total === 0
        ? // 0/0 is vacuously "all done". Saying "Send payment link" to a
          // community that has not started setting up is the wrong instruction.
          'Checklist not started'
        : firstIncomplete
          ? humanizeItemKey(firstIncomplete.key)
          : 'Send payment link',
    href: `/clients/${row.id}`,
    occurredAt: row.created_at,
  };
}

function activeCard(row: ActiveInput, now: Date): PipelineCard {
  return {
    id: `active-${row.id}`,
    stage: 'active',
    name: row.name,
    meta: `Live ${plural(daysBetween(row.created_at, now), 'day')}`,
    pct: 100,
    steps: '',
    blocker: null,
    next: '30-day check-in call',
    href: `/clients/${row.id}`,
    occurredAt: row.created_at,
  };
}

/**
 * Blocked first, then whoever has waited longest.
 *
 * One rule for all four columns rather than a per-stage order, because the board
 * answers one question — what has been sitting here — and "newest first" answers
 * the opposite one for a queue.
 */
function byUrgency(a: PipelineCard, b: PipelineCard): number {
  const blocked = Number(b.blocker !== null) - Number(a.blocker !== null);
  if (blocked !== 0) return blocked;
  return a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0;
}

/** Pure. Every stage rule lives here; `getPipeline` only fetches. */
export function deriveStages(input: DeriveInput, now: Date): Record<Stage, PipelineCard[]> {
  return {
    lead: input.leads.map((l) => leadCard(l, now)).sort(byUrgency),
    demo: input.demos
      .filter((d) => !d.is_converted)
      .map((d) => demoCard(d, now))
      .sort(byUrgency),
    trial: input.trials.map((t) => trialCard(t, now)).sort(byUrgency),
    active: input.active.map((a) => activeCard(a, now)).sort(byUrgency),
  };
}

/**
 * Which trial's checklist the page expands: the one asked for, else the trial
 * whose period ends soonest, else the first card.
 *
 * A trial with no `subscription_current_period_end_at` sorts LAST rather than
 * first — a missing date is not an imminent one, and treating it as `0` would
 * focus the community with the least information about it.
 */
export function pickFocusTrial(trials: TrialInput[], requested?: number): TrialInput | null {
  if (trials.length === 0) return null;
  if (requested !== undefined) {
    const asked = trials.find((t) => t.id === requested);
    if (asked) return asked;
  }
  return [...trials].sort((a, b) => {
    const ae = a.subscription_current_period_end_at;
    const be = b.subscription_current_period_end_at;
    if (ae === be) return a.id - b.id;
    if (ae === null) return 1;
    if (be === null) return -1;
    return ae < be ? -1 : 1;
  })[0]!;
}

/** The expanded checklist for one trial. */
export function buildChecklist(trial: TrialInput): PipelineChecklist {
  return {
    communityId: trial.id,
    name: trial.name,
    trialEndsAt: trial.subscription_current_period_end_at,
    items: collapseChecklist(trial.checklist).map((item) => ({
      key: item.key,
      label: humanizeItemKey(item.key),
      done: item.done,
      meta: item.done ? 'Done' : 'Not started',
    })),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`onboarding pipeline: ${context}: ${error.message}`);
}

/**
 * Load every row the board is derived from.
 *
 * Each read is capped at `PLATFORM_LIST_LIMIT`. A board is a worklist, not a
 * report: it has no total to be wrong about, so a cap truncates the tail of an
 * ordered queue rather than misstating a number.
 */
export async function getPipeline(focusCommunityId?: number): Promise<Pipeline> {
  const db = createAdminClient();
  const now = new Date();
  const newlyActiveSince = new Date(
    now.getTime() - NEWLY_ACTIVE_WINDOW_DAYS * MS_PER_DAY,
  ).toISOString();

  const [leadsResult, demosResult, trialsResult, activeResult] = await Promise.all([
    db
      .from('marketing_leads')
      .select('id, association_name, unit_count, source, status, created_at')
      .in('status', [...OPEN_LEAD_STATUSES])
      .order('created_at', { ascending: false })
      .limit(PLATFORM_LIST_LIMIT),
    // admin-community-scope:exempt — the embedded `communities` row is read FOR
    // its demo status, not as a population: a demo instance is "converted" only
    // once the community it seeded has had `is_demo` cleared, so filtering that
    // join to `is_demo = false` would hide the very rows this stage is about.
    // The demo stage's population comes from `demo_instances`, which this does
    // scope (`deleted_at is null`).
    //
    // MEASURED: this marker currently SUPPRESSES NOTHING. `guard:admin-community-scope`
    // matches a string literal equal to `'communities'`, and a PostgREST embed
    // hides the table name inside a longer `.select()` string — so neither this
    // chain nor the identical join in `lib/db/demo-queries.ts` is seen as a read
    // at all. The marker is here because the reasoning is the same one the guard
    // asks for, and because a refactor to `.from('communities')` would need it
    // for real. Do not read its presence as proof the guard covered this.
    db
      .from('demo_instances')
      .select('id, prospect_name, created_at, communities:seeded_community_id(is_demo)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PLATFORM_LIST_LIMIT),
    db
      .from('communities')
      .select('id, name, created_at, subscription_current_period_end_at')
      .eq('subscription_status', 'trialing')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PLATFORM_LIST_LIMIT),
    db
      .from('communities')
      .select('id, name, created_at')
      .eq('subscription_status', 'active')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .gte('created_at', newlyActiveSince)
      .order('created_at', { ascending: false })
      .limit(PLATFORM_LIST_LIMIT),
  ]);

  throwIfError(leadsResult.error, 'leads');
  throwIfError(demosResult.error, 'demos');
  throwIfError(trialsResult.error, 'trialing communities');
  throwIfError(activeResult.error, 'newly active communities');

  const demoRows = (demosResult.data ?? []) as unknown as DemoInstanceReadRow[];
  const demos: DemoInput[] = demoRows.map((row) => {
    const isDemo = embeddedIsDemo(row.communities);
    return {
      id: row.id,
      prospect_name: row.prospect_name,
      created_at: row.created_at,
      // The same derivation as `lib/db/demo-queries.ts`: a demo whose seeded
      // community is gone (or was never recorded) is NOT converted.
      is_converted: isDemo === null ? false : !isDemo,
    };
  });

  const trialRows = (trialsResult.data ?? []) as {
    id: number;
    name: string;
    created_at: string;
    subscription_current_period_end_at: string | null;
  }[];
  const trialIds = trialRows.map((r) => r.id);

  const [rootRows, checklistRows] = await Promise.all([
    fetchRootManagerCommunityIds(db, trialIds),
    fetchChecklistRows(db, trialIds),
  ]);

  const trials: TrialInput[] = trialRows.map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    subscription_current_period_end_at: row.subscription_current_period_end_at,
    hasRoot: rootRows.has(row.id),
    checklist: checklistRows.get(row.id) ?? [],
  }));

  const focus = pickFocusTrial(trials, focusCommunityId);

  return {
    stages: deriveStages(
      {
        leads: (leadsResult.data ?? []) as LeadInput[],
        demos,
        trials,
        active: (activeResult.data ?? []) as ActiveInput[],
      },
      now,
    ),
    checklist: focus ? buildChecklist(focus) : null,
    generatedAt: now.toISOString(),
  };
}

/**
 * The shape a PostgREST embed comes back as.
 *
 * `seeded_community_id` is a plain FK, so the relationship is to-ONE and the
 * runtime value is an object (or `null`) — which is what `lib/db/demo-queries.ts`
 * has always assumed and what production serves. supabase-js's inference cannot
 * always tell a to-one embed from a to-many one and widens it to an array, so
 * this accepts both rather than asserting one and hoping. An empty array reads
 * the same as `null`: no community, so nothing to derive from.
 */
type EmbeddedCommunity = { is_demo: boolean } | { is_demo: boolean }[] | null;

interface DemoInstanceReadRow {
  id: number;
  prospect_name: string;
  created_at: string;
  communities: EmbeddedCommunity;
}

/** `null` means "no seeded community", which is NOT the same as `is_demo: false`. */
function embeddedIsDemo(embed: EmbeddedCommunity): boolean | null {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row ? row.is_demo : null;
}

async function fetchRootManagerCommunityIds(
  db: ReturnType<typeof createAdminClient>,
  communityIds: number[],
): Promise<Set<number>> {
  if (communityIds.length === 0) return new Set();
  const { data, error } = await db
    .from('user_roles')
    .select('community_id')
    .eq('role', 'root_manager')
    .in('community_id', communityIds);
  throwIfError(error, 'root managers');
  // At most one root per community (`user_roles_one_root_per_community`), so
  // this read is bounded by `communityIds.length` and needs no paging.
  return new Set(((data ?? []) as { community_id: number }[]).map((r) => r.community_id));
}

async function fetchChecklistRows(
  db: ReturnType<typeof createAdminClient>,
  communityIds: number[],
): Promise<Map<number, ChecklistInput[]>> {
  const byCommunity = new Map<number, ChecklistInput[]>();
  if (communityIds.length === 0) return byCommunity;
  const { data, error } = await db
    .from('onboarding_checklist_items')
    .select('community_id, item_key, completed_at')
    .is('deleted_at', null)
    .in('community_id', communityIds)
    // Insertion order, so `collapseChecklist`'s first-seen ordering — and with
    // it "the next incomplete step" — is stable between renders.
    .order('id', { ascending: true });
  throwIfError(error, 'onboarding checklist');
  for (const row of (data ?? []) as (ChecklistInput & { community_id: number })[]) {
    const list = byCommunity.get(row.community_id) ?? [];
    list.push({ item_key: row.item_key, completed_at: row.completed_at });
    byCommunity.set(row.community_id, list);
  }
  return byCommunity;
}
