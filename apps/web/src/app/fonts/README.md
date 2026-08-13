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

| File | Family | Axes | sha256 | Bytes |
|---|---|---|---|---|
| `inter-latin-var.woff2` | Inter | `wght 100..900` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | 48,256 |
| `fraunces-latin-var.woff2` | Fraunces (normal) | `opsz 9..144`, `wght 100..900` | `7234ed860a9cc83045413c4faee63c960a8f2d1917adcf728119307d56e0d783` | 67,304 |
| `fraunces-latin-var-italic.woff2` | Fraunces (italic) | `opsz 9..144`, `wght 100..900` | `066710ce7ed235a339d3d6cdcc8b55c0bea5632232662d83aacea25852108271` | 81,520 |

Sources (all `/* latin */`, from the URLs in "Refreshing them" below):

- `fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2`
- `fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2`
- `fonts.gstatic.com/s/fraunces/v38/6NU58FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lKqZTnbB-gzTK0K1ChjeveQ.woff2`

`apps/admin/src/app/fonts/inter-latin-var.woff2` is a byte-identical copy of the
Inter file above (same sha256).

## What actually changed visually

Two deltas, neither large, both real. Recorded because "we only changed where
the bytes come from" would be untrue:

**1. Fraunces now has live optical sizing.** The vendored files expose an
`opsz` axis (9–144), and `font-optical-sizing: auto` is the CSS initial value —
nothing in this repo overrides it. The per-weight files Google previously served
had `opsz` pinned. So Fraunces now adapts its design to the rendered size:
measured on the vendored file at `wght 600`, glyphs run roughly **1–3% narrower
with a slightly smaller x-height** at the sizes actually used (marketing `.mk-h1`
70px/46px, `.mk-price .mk-amt` 42px, app headings ~18–32px).

This is what the family is designed to do and it is kept deliberately. If
byte-identical rendering to the old build ever matters more, set
`font-optical-sizing: none` on the Fraunces consumers — do not "fix" it by
pinning the axis in the font file.

**2. One rule now renders at true 800.** `(marketing)/marketing-theme.css:109`
(`.mk-law .mk-n`, the numbered statute badges) sets `font-weight:800` on
Fraunces. Google's files stopped at 700, so the browser snapped down; the
variable file covers 800. Visible only side by side.

The `font-weight:800` at `:73` and `:155` applies to `✓` (U+2713), which is in
neither font's cmap and fell back to a system font before and after. No change.

One variable file per face replaces the per-weight static instances Next used to
download. The full 100–900 range is now available — previously 400/500/600/700
for Inter and, in the app shell, 500/600/700 for Fraunces; the marketing layout
requested Fraunces 400–700 in both normal and italic. Total bytes are roughly
unchanged: 47K + 66K + 80K.

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

**Use `curl --fail`.** Bare `curl` writes an HTTP error body to the output file
and still exits 0 — so a rate-limit or captcha page saves happily as a
`.woff2`, which is the exact failure this section exists to prevent.

### Verifying a refresh

Update the sha256 column above in the same commit, and review the new values as
carefully as the code — they are what makes these files *verifiable* rather than
merely *pinned*.

```bash
shasum -a 256 *.woff2
```

If the hash is unchanged, upstream did not revise the font and the refresh is a
no-op. If it changed, confirm the file is a sound font before trusting it:

```bash
head -c4 inter-latin-var.woff2                  # must print: wOF2
python3 -c "import struct,sys; d=open(sys.argv[1],'rb').read(); \
  print('declared', struct.unpack('>I', d[8:12])[0], 'actual', len(d))" \
  inter-latin-var.woff2                          # the two must match
```

The magic-byte check alone is not enough: it proves the first four bytes, not
that the download completed. The WOFF2 header carries the total file length at
offset 8, so comparing it against the real size is what catches a truncated
fetch — a half-downloaded font still starts with `wOF2`.

## Licence

Both families are under the **SIL Open Font License 1.1**, which permits
redistribution including bundling with an application.

`OFL-Inter.txt` and `OFL-Fraunces.txt` are each family's licence file copied
verbatim from `github.com/google/fonts`. They are kept separate rather than
merged into one: the two texts are not byte-identical (they differ in the scheme
of one SIL URL), and a single file would have had to misattribute one of them.
