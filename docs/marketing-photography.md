# Marketing photography — provenance

Source record for `apps/web/public/marketing/v1/`. This lives in `docs/` rather
than beside the images: anything under `public/` is publicly fetchable, and the
middleware matcher excludes `.webp` but not `.md`, so a note left there would
both be served to the world and run the full middleware chain per request.

Every file in this directory is an [Unsplash License](https://unsplash.com/license)
photo. That license permits commercial use and does **not** require attribution, so
nothing here is rendered on the page — this file exists so the choice stays auditable.

Sourcing rule: **free Unsplash only.** Photos served from `plus.unsplash.com` are
Unsplash+, a separate paid license, and must never be used here. Every candidate was
filtered on that host before download.

Each image was downloaded at `w=2600&q=85`, centre-cropped to the aspect ratio its
container uses in `marketing-theme.css`, and encoded with `cwebp -m 6`.

| Base name | Widths emitted | Source crop | Unsplash ID | Photographer | Source |
|---|---|---|---|---|---|
| `who-condo` | 400, 800, 1100 | 1100×1100 | `Hf15INRT36Q` | Zoshua Colah | https://unsplash.com/photos/Hf15INRT36Q |
| `who-hoa` | 400, 800, 1100 | 1100×1100 | `iD4afX1XGrU` | Nadi Spasibenko | https://unsplash.com/photos/iD4afX1XGrU |
| `who-cam` | 400, 800, 1100 | 1100×1100 | `nGsVMkRatgM` | Ryan Ancill | https://unsplash.com/photos/nGsVMkRatgM |
| `records-band` | 800, 1600, 2400 | 2400×800 | `l1cORHsLqZ0` | Avi Werde | https://unsplash.com/photos/l1cORHsLqZ0 |
| `onboarding` | 400, 800 | 1500×1125 | `BJqzjxwQhK8` | sarah b | https://unsplash.com/photos/BJqzjxwQhK8 |
| `close-coast` | 800, 1440 | 1800×1350 | `KANXooKn9Po` | Barefoot Beach Designs | https://unsplash.com/photos/KANXooKn9Po |

Each width is `cwebp -m 6 -resize <w> 0` from the cropped master, quality 76 (62 for
`who-hoa`, 66 for `records-band` — both are foliage/architecture detail and needed a
lower setting to stay under budget).

Served as plain `<img>` with `srcset`, never `next/image`, and from a **versioned**
directory so `apps/web/vercel.json` can mark them `immutable` — these filenames are not
content-hashed, so replacing a photograph means emitting `v2/` and bumping
`ASSET_VERSION` in `apps/web/src/components/marketing/marketing-photo.tsx`. Never
overwrite a file inside a version that has shipped.
