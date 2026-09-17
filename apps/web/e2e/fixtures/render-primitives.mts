/**
 * Renders the shared control primitives to static markup, for
 * `e2e/touch-target-audit.spec.ts` to measure in a real engine.
 *
 * ## Why this is a separate process instead of part of the spec
 *
 * Playwright transforms every `.tsx` it loads with its OWN JSX factory — the
 * one behind `{ __pw_type, type, props, key }` — so a component imported into a
 * spec never produces React elements and `renderToStaticMarkup` throws
 * "Objects are not valid as a React child". That is a property of Playwright's
 * loader, not something a pragma or a nested tsconfig can reach, because the
 * transform is governed by the tsconfig nearest the COMPONENT, not the spec.
 *
 * `tsx` compiles the same files with the ordinary React runtime, so the render
 * happens here and the spec consumes JSON. The cost is one subprocess per run;
 * the thing it buys is that the fixture is the components themselves.
 *
 * ## Why render at all, rather than write the classes down
 *
 * Only `buttonVariants` exports its class string. Input, Checkbox, Switch,
 * SelectTrigger, TabsTrigger and QuickFilterTabs keep theirs inline in JSX, so
 * a fixture that names them is a copy — and a copy stops matching the component
 * silently, which is the exact failure this audit exists to correct.
 *
 * Output: JSON on stdout. Run it directly to see the markup:
 *   pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/e2e/fixtures/render-primitives.mts
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Checkbox } from '../../src/components/ui/checkbox';
import { FieldOverlay } from '../../src/components/esign/field-overlay';
import { HelpTooltip } from '../../src/components/ui/help-tooltip';
import { Select, SelectTrigger, SelectValue } from '../../src/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../src/components/ui/tabs';
// From SOURCE, not the `@propertypro/ui` barrel: the barrel pulls
// `@propertypro/tokens` (CJS, no named exports under this loader), and more
// importantly `packages/ui/dist` is a build artifact that can lag `src` — a
// fixture measuring a stale build would be confidently wrong.
import { QuickFilterTabs } from '../../../../packages/ui/src/components/shared/quick-filter-tabs';
import { Button } from '../../../../packages/ui/src/components/ui/button';
import { Input } from '../../../../packages/ui/src/components/ui/input';
import { Switch } from '../../../../packages/ui/src/components/ui/switch';

export type RenderedPrimitive = {
  name: string;
  html: string;
  /** What to measure inside the fragment. */
  selector: string;
  note?: string;
};

/**
 * The classic JSX runtime needs a global `React`, and here it genuinely does.
 *
 * `apps/web/tsconfig.json` is `"jsx": "preserve"` because Next compiles the app
 * itself, so when tsx hands these files to esbuild they come out using the
 * CLASSIC runtime — bare `React.createElement(...)` calls. Most components in
 * this repo import only the hooks they use (`import { useRef } from 'react'`),
 * which is correct for Next and fatal here: `ReferenceError: React is not
 * defined` at render time, not import time.
 *
 * Passing a `--tsconfig` with `"jsx": "react-jsx"` does not fix it — tsx does
 * not apply that file's JSX setting to imported modules. One assignment does,
 * for every component, without touching a single production config.
 */
(globalThis as { React?: typeof React }).React = React;

const h = React.createElement;

const entries: { name: string; node: React.ReactElement; selector: string; note?: string }[] = [
  {
    name: 'Button size=default',
    node: h(Button, null, 'Save changes'),
    selector: 'button',
    note: '168 of 344 call sites pass no size at all',
  },
  {
    name: 'Button size=sm',
    node: h(Button, { size: 'sm' }, 'Edit'),
    selector: 'button',
    note: 'the most-used explicit size — 156 of 344 call sites',
  },
  { name: 'Button size=lg', node: h(Button, { size: 'lg' }, 'Get started'), selector: 'button' },
  {
    name: 'Button size=icon',
    node: h(Button, { size: 'icon', 'aria-label': 'Close' }, '×'),
    selector: 'button',
    note: 'square, so width binds as tightly as height',
  },
  { name: 'Input', node: h(Input, { placeholder: 'Unit number' }), selector: 'input' },
  {
    name: 'SelectTrigger',
    node: h(Select, null, h(SelectTrigger, null, h(SelectValue, { placeholder: 'Pick one' }))),
    selector: '[role="combobox"]',
  },
  {
    name: 'Checkbox (bare)',
    node: h(Checkbox, null),
    selector: '[role="checkbox"]',
    note: 'h-4 w-4 — the control box on its own',
  },
  {
    // How the app actually writes one: `pm/BulkAnnouncementDialog.tsx:220-229`,
    // a `flex items-center gap-2` row with `<Checkbox id>` beside a
    // `<label htmlFor>`. Included because the audit asserts, without ever
    // having measured it, that "a checkbox's real target is its `<label>`".
    // Clicking the label does activate the control; whether the RULE credits
    // that is a different question, and only a measurement answers it.
    name: 'Checkbox (+ sibling label, as shipped)',
    node: h(
      'div',
      { className: 'flex items-center gap-2' },
      h(Checkbox, { id: 'probe-cb' }),
      h('label', { htmlFor: 'probe-cb', className: 'text-sm text-content' }, 'Pin this announcement'),
    ),
    selector: '[role="checkbox"]',
    note: 'the shipped shape — the label is a sibling, not a wrapper',
  },
  {
    name: 'Switch',
    node: h(Switch, { 'aria-label': 'Email digests' }),
    selector: '[role="switch"]',
    note: 'h-5 w-9',
  },
  {
    // Not a design-system primitive, but the smallest interactive control found
    // anywhere in `apps/web/src`, and the one shape where the SPACING exception
    // provably cannot rescue it: `field-overlay.tsx:175` pins a `size-4` remove
    // button at `-right-2 -top-2` of a field box that is ITSELF a target (the
    // field is draggable and selectable). Two targets that close means neither
    // gets the exception, which is precisely what an isolated measurement of
    // either one would miss. Rendered whole, with `mode: 'edit'` and the field
    // selected, because that is the only state in which the button exists.
    name: 'esign field remove button (in situ)',
    node: h(
      'div',
      { style: { position: 'relative', width: '320px', height: '160px' } },
      h(FieldOverlay, {
        fields: [
          {
            id: 'probe-field',
            type: 'signature',
            signerRole: 'owner',
            page: 0,
            x: 20,
            y: 20,
            width: 40,
            height: 20,
            required: true,
          },
        ],
        pageDimensions: { width: 320, height: 160 },
        currentPage: 0,
        mode: 'edit',
        selectedFieldId: 'probe-field',
        onFieldSelect: () => {},
        onFieldUpdate: () => {},
        onFieldRemove: () => {},
        signerRoleColors: { owner: '#6b7280' },
      }),
    ),
    selector: '[aria-label="Remove field"]',
    note: 'size-4 — overlaps the field box, which is also a target',
  },
  {
    // In its real adjacency: `board/elections/election-detail-dialog.tsx:77-82`
    // is a `flex items-center gap-1.5` line of TEXT with the tooltip at the
    // end. That matters — the neighbours are spans, not targets, so the
    // spacing exception has room to work. Placed bare it would be measured in
    // a situation the app never produces.
    name: 'HelpTooltip trigger (in situ)',
    node: h(
      'p',
      { className: 'flex items-center gap-1.5 text-sm' },
      h('span', { className: 'font-medium' }, 'Quorum:'),
      '20%',
      h(HelpTooltip, { content: 'The share of owners who must vote.' }),
    ),
    selector: 'button',
    note: 'size-5 — a primitive, so it repeats wherever help is offered',
  },
  {
    name: 'QuickFilterTabs pill',
    node: h(QuickFilterTabs, {
      tabs: [
        { label: 'All', value: 'all' },
        { label: 'Open', value: 'open', count: 3 },
      ],
      active: 'all',
      onChange: () => {},
    }),
    selector: 'button',
    note: 'h-8 — shared across five screens',
  },
  {
    name: 'TabsTrigger',
    node: h(
      Tabs,
      { defaultValue: 'a' },
      h(TabsList, null, h(TabsTrigger, { value: 'a' }, 'Overview'), h(TabsTrigger, { value: 'b' }, 'Documents')),
    ),
    selector: '[role="tab"]',
    note: 'no height class of its own — padding plus an 18px-root line box',
  },
];

/**
 * ## One control is absent, and it is a judgement rather than a blocker
 *
 * `shared/data-table-pagination.tsx`'s prev/next arrows (`h-8 w-8`, on every
 * paginated table) need a live TanStack `Table` instance to render. At 32x32
 * they are already clear of the 24x24 threshold on their own geometry, so the
 * setup would buy no conclusion — only a row that says "ok".
 *
 * Do NOT close that gap by transcribing their classes into a fixture. A copy
 * that drifts is worse than a gap that is written down.
 */
const rendered: RenderedPrimitive[] = entries.map(({ name, node, selector, note }) => ({
  name,
  selector,
  note,
  html: renderToStaticMarkup(node),
}));

process.stdout.write(JSON.stringify(rendered));
