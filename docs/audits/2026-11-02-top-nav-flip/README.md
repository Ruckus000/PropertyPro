# Top tabs on by default — flip evidence (2026-11-02)

The flip PR after #1438. `NEXT_PUBLIC_TOP_NAV_ENABLED` is now ON unless it is exactly `false`
(a kill switch). Production sets no value (checked with `vercel env ls production`), so the
tabs ship with the next deploy.

## Browser check

Local agent sandbox (`pnpm agent:live:web`, demo seed, plus `pnpm help:capture:fixtures` for a
pending join request and missing-records counts, plus one fixture community with a long name).
Headless Chromium at 1440, 1024, 1023 and 390 px, deviceScaleFactor 1.5.

| Persona | Tabs at ≥1024 px | More groups | Result |
|---|---|---|---|
| Manager, Sunset Condos (Professional) | Dashboard, Documents, Meetings, Announcements, Website (1), Compliance, Directory (1) | Community, Management, Admin | Fits at 1024 with both badges |
| Manager, Palm Shores (Essentials) | same 7 | locked items show **Pro** and open the upgrade dialog | Focus returns to **More** on close |
| Root manager, Sunset Ridge (apartment) | 6 (no Compliance) | Community, Management, Admin | OK |
| Board member, Sunset Condos | Dashboard, Documents, Meetings, Announcements | Community, Management | OK |
| Tenant, Sunset Condos | same 4 | Community, Management (no Payments) | Panel kept 16 px off the left edge |
| PM portfolio (`/pm/dashboard/communities`) | Communities, Website, Templates, Reports | none | OK |
| No community (`/select-community`) | none | none | Rail and its community picker come back |
| Root manager, long community name | 7 | 3 | Brand truncates with an ellipsis and a `title` |

At 1023 px and below every persona gets the hamburger and the unchanged rail drawer. No case
scrolled the page horizontally or overflowed the top bar. No console errors on the tenant,
Essentials manager or PM pages after the fixes below.

Found and fixed during the check:
- **Hydration error on More**: Radix's `useId` under the shell's `next/dynamic` boundary differed
  between server and client, so `aria-controls` pointed at nothing. Fixed with a fixed panel id.
  (Proved by swapping in a static import: the error disappeared; restored: it came back.)
- **More panel flush against the screen edge** for residents (4 tabs): `collisionPadding={16}`.
- **Focus after an upgrade dialog** fell to `<body>` for locked tabs as well as locked More items:
  Radix refocuses only a registered `DialogTrigger`, and this dialog has none.

## Bundle (production build, CI's stub env)

| Build | Web aggregate | Budget | Tab-row chunk |
|---|---|---|---|
| Default (tabs on), first PR head | 1430.7 KiB local · **1433.9 KiB CI** | 1435.0 KiB | present |
| Same head, localci after merging main (#1441) | **1435.3 KiB — over** | 1435.0 KiB | present |
| `NEXT_PUBLIC_TOP_NAV_ENABLED=false`, same tree | 1434.0 KiB local | 1435.0 KiB | absent (0 chunks) |
| Tabs on, after the two fixes below | **1433.0 KiB local** | 1435.0 KiB | present |

The tabs add ~1.3 KiB, nearly all in the `(authenticated)/layout` chunk (the shell). Two fixes:
- **One `AppSidebar` prop set and one desktop-rail element** (checklist item 8). `topNav` is a
  runtime prop, so both branches of the rail ternary survived the tabs-on build, three full copies
  of ten props in all: −0.7 KiB.
- **`NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` defined in `next.config.ts` `env`**, like the tab flag.
  Unset (CI, local), its `=== 'true'` check survived in ~40 first-load chunks with both branches;
  production sets it in Vercel and was already inlined, so no environment changes behaviour: −1.6 KiB.

Local and CI readings differ by about 1.5 KiB in either direction on the same commit, so the
budget has little room left for the next shell change.

## Screenshots

`manager-condo-1440.jpg`, `manager-condo-1024.jpg` (worst case: two badges at 1024),
`manager-hoa-essentials-1024-more.jpg`, `manager-hoa-essentials-1440-upgrade.jpg`,
`tenant-1024-more.jpg`, `longname-root-1024.jpg`, `pm-portfolio-1440.jpg`,
`no-community-1440.jpg` (rail fallback), `tenant-390-drawer.jpg` (phone drawer, unchanged).
