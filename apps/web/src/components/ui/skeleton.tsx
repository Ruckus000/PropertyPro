// From the file, not the `@propertypro/ui` barrel. `loading.tsx` files are
// server components, and a server component importing the barrel put every
// `'use client'` module it re-exports (Dialog, Sheet, cmdk, …) into that
// segment's client bundle, for one `<div>`. Measured 2026-10-13: 97 KiB off
// every /mobile page and ~46 KiB off most authenticated ones.
//
// Repointing the other shims was measured too: `page-body` and `alert-banner`
// moved five routes 42–50 KiB and are repointed; `card`, `badge`, `input` and
// `textarea` moved nothing; `button` traded ~35 KiB off 26 routes for +8 KiB
// on five (the dashboard among them) and +52 KiB of total unique JS, because it
// re-partitions the shared chunks — left on the barrel.
export { Skeleton } from '@propertypro/ui/components/ui/skeleton';
