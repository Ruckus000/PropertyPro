# Vendored fonts

These are the exact `latin`-subset **variable** instances Google Fonts serves,
committed to the repo and loaded with `next/font/local`.

## Why they are here rather than fetched at build time

`next/font/google` downloads font files during `next build`. That put
`fonts.gstatic.com` on the critical path of every production build, and
`perf-check` owns the **only** production build in CI while the required `Build`
check asserts on its success. So a transient failure at Google did not fail one
job — it made every PR in the repo unmergeable until a human re-ran it.

That happened twice in one day on unrelated PRs (#962):

```
Failed to fetch font file from `https://fonts.gstatic.com/s/fraunces/v38/...woff2`.
Retrying 1/3... Retrying 2/3... Retrying 3/3...
`next/font` error: Failed to fetch `Fraunces` from Google Fonts.
> Build failed because of webpack errors
```

Next's own retries do not help: the failures arrive simultaneously across every
weight, which reads as egress throttling rather than per-request loss.

Vendoring removes the network from the build entirely. It also makes builds
reproducible — a Google-side font revision can no longer change rendering
without a commit.

## What is here

| File | Family | Axes | Source |
|---|---|---|---|
| `inter-latin-var.woff2` | Inter | `wght 100..900` | `fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` |
| `fraunces-latin-var.woff2` | Fraunces (normal) | `wght 100..900` | `fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2` |
| `fraunces-latin-var-italic.woff2` | Fraunces (italic) | `wght 100..900` | `fonts.gstatic.com/s/fraunces/v38/6NU58FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lKqZTnbB-gzTK0K1ChjeveQ.woff2` |

One variable file per face replaces the per-weight static instances Next used to
download. The full 100–900 range is now available (previously 400/500/600/700
for Inter, 500/600/700 for Fraunces), and total bytes are roughly unchanged:
47K + 66K + 80K.

`apps/admin/src/app/fonts/inter-latin-var.woff2` is a **copy of the same file**.
The duplication is deliberate: `next/font/local` needs a literal path relative
to the importing file, so a shared `packages/` location would mean a
`../../../../` traversal that breaks the moment either app moves. Two identical
47K files is the cheaper failure mode.

## Refreshing them

Only needed to pick up an upstream font revision — there is no expiry.

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
```

Send a modern browser User-Agent — Google serves `.ttf` to unrecognised clients
and `.woff2` only to browsers that advertise support. Take the URL from the
`/* latin */` block (the others are cyrillic/greek/vietnamese and we only
declare `latin`), download it, and drop it in here under the same filename. Do
the same for Fraunces with:

```
family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900
```

Then copy `inter-latin-var.woff2` to `apps/admin/src/app/fonts/`.

Verify what you downloaded is actually a woff2 before committing — a rate-limit
or error page will happily save as a `.woff2`:

```bash
head -c4 inter-latin-var.woff2   # must print: wOF2
```

## Licence

Both families are under the **SIL Open Font License 1.1**, which permits
redistribution including bundling with an application.

`OFL-Inter.txt` and `OFL-Fraunces.txt` are each family's licence file copied
verbatim from `github.com/google/fonts`. They are kept separate rather than
merged into one: the two texts are not byte-identical (they differ in the scheme
of one SIL URL), and a single file would have had to misattribute one of them.
