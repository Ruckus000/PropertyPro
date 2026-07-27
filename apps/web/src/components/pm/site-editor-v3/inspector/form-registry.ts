'use client';

/**
 * Per-block inspector form registry — the only place a block type maps to its
 * edit form.
 *
 * Mirrors `blockViewRegistry` (`components/public-site/blocks/view-registry.ts`)
 * on purpose, so there is one mental model for "block type -> component" in the
 * editor: a plain lookup table, `Partial` because coverage is incremental, and
 * a `hasForm` guard so callers branch on presence rather than on a type list.
 *
 * ## Every entry is `next/dynamic`, without exception
 *
 * The editor route runs against a 700 KiB hard budget that fails the build.
 * A uniform rule is worth more than per-form judgement here: it means a future
 * form that reaches for a rich-text editor, a crop tool or a Radix combobox
 * cannot quietly land that dependency in the initial payload. The saving on any
 * ONE small form is ~1 KiB — the point is the ceiling, not the current total.
 *
 * That is enforced by `form-registry.test.ts`, which reads this file's source,
 * because the failure mode is silent: a static import here still renders
 * correctly and still passes every behavioural test. It only shows up as a
 * bigger number in `pnpm perf:check`.
 *
 * ## Rules for anything under `./forms/`
 *
 * 1. **No `@/components/ui/select`, `popover`, `command`, or `@radix-ui/*`.**
 *    Those pull dialog/portal stacks measured in tens of KiB. Phase 2b-2's
 *    retrospective is explicit that Radix stacks — not components — were the
 *    real cost on this route. Native form controls cover everything these forms
 *    need, with better keyboard semantics.
 * 2. **No `react-image-crop`.** The v2 `ImageBlockForm` uses it; it must not
 *    follow into v3. Cropping, if it ever arrives, is its own chunk behind an
 *    explicit button.
 * 3. **No `@/lib/site-assets/storage-paths`** — it imports `node:crypto` and
 *    fails at `next build`, not at test time. Use `@/lib/site-assets/public-url`.
 *
 * Rules 1 and 2 are enforced by the same source-reading test.
 */
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { BlockType } from '@propertypro/shared';
import { InspectorFormSkeleton } from './InspectorFormSkeleton';
import type { BlockFormProps } from './types';

export const blockFormRegistry: Partial<Record<BlockType, ComponentType<BlockFormProps>>> = {
  text: dynamic(() => import('./forms/TextForm').then((m) => m.TextForm), {
    loading: InspectorFormSkeleton,
  }),
};

/** Whether this block type has an edit form yet. Coverage is incremental. */
export function hasForm(blockType: string): boolean {
  return Object.prototype.hasOwnProperty.call(blockFormRegistry, blockType);
}
