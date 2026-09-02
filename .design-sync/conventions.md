# PropertyPro design system — how to build with it

PropertyPro is a compliance and community-management platform for Florida
condominium and HOA associations. The visual language is **"Florida Modern"**:
warm sand surfaces, a coral primary, and a display serif for page titles.

## Setup

**No provider is required.** Components read their styling from CSS custom
properties defined in the stylesheet, not from React context, so any component
renders correctly on its own. Two exceptions:

- `Tooltip` must be wrapped in `TooltipProvider` (once, high in the tree).
- Radix overlays (`Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Select`,
  `AlertDialog`) render through a portal — give the page a normal document flow
  and they position themselves.

The page ground is `bg-surface-page`; cards and panels sit on `bg-surface-card`.
Set `text-content` on the body. The root font-size is **18px**, so every
rem-based size is 12.5% larger than a stock Tailwind build — do not compensate.

## Styling idiom: semantic Tailwind classes only

This is a Tailwind system with a **semantic** palette. Never use raw palette
classes (`bg-blue-500`), raw hex, or arbitrary colour values — they are banned by
a CI guard. Compose with these families:

| Family | Utilities | Values |
|---|---|---|
| `content` | `text-content-*` | (default), `secondary`, `tertiary`, `disabled`, `placeholder`, `inverse`, `brand`, `link`, `link-hover` |
| `surface` | `bg-surface-*` | `page`, `card`, `subtle`, `muted`, `elevated`, `sunken`, `hover`, `inverse`, `inverse-subtle` |
| `edge` | `border-edge-*` | (default), `subtle`, `strong`, `muted`, `focus`, `error` |
| `interactive` | `bg-/text-/border-interactive-*` | (default), `hover`, `active`, `disabled`, `subtle`, `subtle-hover`, `muted` |
| `status` | `text-/bg-/border-status-*` | `success`, `warning`, `danger`, `info`, `neutral`, `brand`, `premium` — each with `-bg`, `-border`, `-subtle` |
| `nav` | `text-nav-*`, `bg-nav-*` | `text-active`, `text-inactive`, `text-muted`, `bg-active`, `bg-hover` |

Type: `font-sans` (Inter) for everything, `font-display` (Fraunces) for page
`h1`s only. Sizes `text-xs` … `text-3xl`. Body copy is `text-base` minimum;
`text-xs` is metadata only, never primary content.

Elevation: `shadow-sm` → `shadow-md` → `shadow-lg`, mapped to a slate-tinted
ladder. Reach for `border-edge` before a shadow. Radius: `rounded-sm` inputs,
`rounded-md` cards and buttons, `rounded-lg` modals, `rounded-full` badges.

**Never put slash-opacity on a semantic token** (`bg-interactive/10`,
`hover:bg-status-danger/90`). These tokens are bare `var(--x)` with no alpha
channel, so Tailwind emits **zero CSS** and the colour silently renders as
nothing. Use a solid `-subtle` / `-bg` / `-hover` token instead, or `white`/
`black` alpha (`bg-white/20`) for genuine translucency.

## Layout

`PageContainer` owns the page gutter and max width — pages do **not** add their
own horizontal padding or a second `<main>`. Use `PageBody` as the content root:
it supplies vertical rhythm and optional narrower centred columns
(`width="prose|form|content|reading|narrow"`). Start every page with
`PageHeader` (it renders the `h1`).

## Status is never colour alone

Always icon + text + colour. Use `StatusBadge` for domain statuses (it resolves
label and icon from a shared status config) rather than colouring a `Badge` by
hand. `Badge` carries the status variant system (`success`/`warning`/`danger`/
`info`/`neutral`/`brand`/`owner`/`board`); `ShadcnBadge` is the plainer
shadcn-style badge (`default`/`secondary`/`destructive`/`outline`).

Two names disambiguate a genuine duplicate in the codebase: `UiLabel` is a
**typography** primitive, while `Label` is the **form** label you pair with an
`Input`. `UiStatusBadge` is the `@propertypro/ui` variant of `StatusBadge`.

## Every data view handles four states

Loading (`Skeleton`), empty (`EmptyState` — encouraging, action-oriented title
plus a constructive action), error (`AlertBanner` with `status="danger"` — note it is `status`, not
`variant`; `variant` selects `filled`/`subtle`/`outlined`), and success. Never ship only the success state.

## An idiomatic screen

```jsx
<PageBody>
  <PageHeader
    title="Documents"
    description="Association records posted under §718.111(12)(g)."
    actions={<Button>Upload Document</Button>}
  />
  <div className="grid gap-6 lg:grid-cols-3">
    <KpiCard title="Posted this month" value={12} trend="up" delta={8} />
    <KpiCard title="Awaiting review" value={3} />
    <KpiCard title="Overdue" value={1} trend="down" />
  </div>
  <Card>
    <CardHeader>
      <CardTitle>Recent uploads</CardTitle>
      <CardDescription>Newest first.</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-content-secondary">
      <DataTable columns={columns} data={rows} />
    </CardContent>
  </Card>
</PageBody>
```

## Where the truth lives

`styles.css` and its imports carry the tokens, fonts and component CSS — read
them before inventing a style. Each component's `.d.ts` is its real API contract
and its `.prompt.md` documents usage. Prefer reading those over guessing.
