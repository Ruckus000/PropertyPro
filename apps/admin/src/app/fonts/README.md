# Vendored fonts (apps/admin)

Every file here is a **byte-identical copy** of the same file in
`apps/web/src/app/fonts/` (same sha256 — `apps/admin/__tests__/styles/font-loading.test.ts`
checks the Geist pair against web's copies). Keep them in sync: when web's files
are refreshed, copy them here in the same commit.

The duplication is deliberate. `next/font/local` needs a literal path relative to
the importing file, so a shared `packages/` location would mean a
`../../../../` traversal that breaks the moment either app moves. Duplicate
files are the cheaper failure mode. They are vendored rather than fetched from
Google at build time because `next/font/google` put `fonts.gstatic.com` on the
critical path of every production build (#962). Provenance, source URLs and the
refresh procedure live in `apps/web/src/app/fonts/README.md`.

## What is here

| File | Family | Axes | sha256 | Bytes |
|---|---|---|---|---|
| `geist-latin-var.woff2` | Geist | `wght 100..900` | `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1` | 29,400 |
| `geist-mono-latin-var.woff2` | Geist Mono | `wght 100..900` | `684ad5b531f81d43c1e8c7038262d5db7cdc1f68006e04d6c7769efa8d33c8cc` | 23,128 |
| `inter-latin-var.woff2` | Inter | `wght 100..900` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | 48,256 |
| `fraunces-latin-var.woff2` | Fraunces (normal) | `opsz 9..144`, `wght 100..900` | `7234ed860a9cc83045413c4faee63c960a8f2d1917adcf728119307d56e0d783` | 67,304 |

Copied from `apps/web/src/app/fonts` — keep in sync.

Which is loaded as what, in `app/layout.tsx`: Geist as `--font-sans`, Geist Mono
as `--font-mono`, Fraunces as `--font-display` (only `AdminPageHeader`'s visible
`<h1>` uses it). Inter is NOT loaded by the root layout. The one exception is the
branding preview in `components/clients/CommunityWebsiteEditor.tsx`, which paints a
community's own fonts as bare CSS family names, `Inter` by default, to show what its
public site will look like. `components/clients/branding-preview-font.ts` loads this
file for that component alone, in a const named `inter` (the const's name is the
emitted family, and `Inter` must match it). Do not move it to the root layout.

## Licence

All four families are under the **SIL Open Font License 1.1**.
`OFL-Fraunces.txt`, `OFL-Geist.txt` and `OFL-Inter.txt` are copied verbatim from `apps/web`
(see its README for their sources). One Geist file covers both Geist and Geist
Mono.
