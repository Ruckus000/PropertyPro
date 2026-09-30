# Help Content Authoring

Help is written per reader. Every article lives at

```
content/help/<section>/<category>/<slug>.mdx
```

## Sections (`section:`)

- Two sections: `resident` and `manager` (`lib/help/sections.ts`). Managers (property or root managers) read `manager`; everyone else — owners, tenants and board members — reads `resident`.
- A task both residents and managers perform is written once per section, **in that reader's words, under the same slug**. `/help/<category>/<slug>` is one URL that shows each reader their own version.
- Slugs are unique within a section. `relatedArticles`, `upNext` and `help:` links resolve within the article's own section.
- **Board help is `boardOnly: true` resident articles**, shown only to readers with a board seat. A seat is otherwise an owner's account, so board members read the ordinary resident articles. Write `boardOnly` articles only for what the UI lets a seat do: election administration (`Board → Elections`) and community export. Violations stay manager-only in the UI — never write a board step that the page does not offer.
- `boardOnly` articles are condo/HOA only (`communityTypes: [condo_718, hoa_720]`). An ordinary article may not link to one in its body (the in-app panel caches rendered HTML per article, not per reader); use `relatedArticles`, which is resolved per reader.

## Community types (`communityTypes:`) and features (`featureGates:`)

- `communityTypes: [condo_718, hoa_720]` limits an article to those types. Omit it for all three.
- Parts of an article that apply to fewer types go in `<OnlyFor types="condo_718 hoa_720">…</OnlyFor>`.
- `featureGates` still applies on top (keys of `CommunityFeatures`). Managers can preview another type's help with the type bar (`?type=`); residents only see their own.

## Frontmatter

```yaml
---
title: "Upload a document"
description: "Add a file to a document category, with a title residents can search for."
section: manager
category: documents
slug: upload-document
communityTypes: [condo_718, hoa_720]   # optional
order: 0                               # position in the topic, lower first
featured: true                         # listed under "Most-used guides"
keywords: ["upload", "file", "pdf"]
relatedArticles: ["document-categories"]
statutes: ["§718.111(12)(g)"]
contextPaths: ["/communities/*/documents"]   # routes where the in-app panel suggests it
updatedAt: "2026-09-30"                # quoted — an unquoted date parses as a Date
boardOnly: true                        # resident section only: shown to board seats
---
```

Categories and their order are in `lib/help/category-meta.ts`.

## Body

- `## Heading` for sections. Paragraphs and `-` lists as normal markdown; `**bold**` for UI labels.
- Links to other help articles: `[label](help:<slug>)`. If the reader cannot see the target (another community type), the label renders as plain text.
- Steps:

  ```mdx
  <StepByStep>

  <Step title="Select Upload" shot="upload-btn">

  It is at the top right of **Documents**.

  </Step>

  </StepByStep>
  ```

  `start={4}` continues numbering from an earlier list.
- Figures: `<Figure shot="panel" alt="…">Optional caption.</Figure>`
- Callouts: `<Callout type="info|warning|tip|florida-statute" title="…">…</Callout>`
- The legal notice is injected on every article; never author one.

## Screenshots (`shot=`)

- A shot name refers to `/help/<section>/<category>/<slug>/<name>.webp`, captured from the real app. Only shots listed in `media-index.json` render; an uncaptured shot shows nothing (never a broken image).
- Every shot an article names must be declared in its capture manifest: `scripts/help-capture/manifests/<section>/<category>/<slug>.json`. `guard:help-content` fails otherwise, and warns while shots are declared but not yet captured.
- Each step shot is cropped to the control it describes and carries the design's callout: the control outlined in the brand colour with the step number on its corner.

```json
{
  "section": "manager",
  "category": "documents",
  "slug": "upload-document",
  "shots": [
    {
      "name": "upload-btn",
      "kind": "still",
      "route": "/communities/{cid}/documents",
      "role": "cam",
      "community": "condo",
      "actions": [{ "type": "waitFor", "selector": "role=button[name=\"Upload\"]" }],
      "clipTo": "main header",
      "highlight": "role=button[name=\"Upload\"]",
      "step": 1
    }
  ]
}
```

- `route` may use `{cid}`: the seeded community for `community` (`condo` → Sunset Condos, `hoa` → Palm Shores HOA, `apartment` → Sunset Ridge Apartments).
- `role` is a `/dev/agent-login` persona: `owner`, `tenant`, `board_member` (an owner with a board seat — use it for `boardOnly` shots), `board_president` (a manager), `cam`, `pm_admin`, `site_manager` (apartment), `founding_admin` (HOA root), `root_sunset`, `root_sunsetridge`.
- Selectors are Playwright selectors (`role=button[name="Upload"]`, `text=Save`, CSS). Prefer roles and visible labels over classes.
- `clipTo` (one selector or several; the crop is their union plus `pad`, default 16px) keeps images small: the budget is 250KB per file.
- `actions`: `click`, `fill`, `press`, `waitFor`, `wait` (≤ 10s), `scrollTo`.

Capture:

```
pnpm dev                                   # seeded demo data
pnpm help:capture manager/documents        # a section, topic or single article
pnpm help:capture --all
```

It writes the images and updates `media-index.json`; commit both. Captures need `pnpm dev`, a local database (`DATABASE_URL`, or `HELP_CAPTURE_COMMUNITY_IDS="condo=…,hoa=…,apartment=…"`), `ffmpeg` for clips, and `pnpm playwright:install` once. Demo data only; never real-community data or PII. After a UI change, re-capture the affected manifests. If component markup changes, bump `HELP_RENDER_VERSION` (`lib/help/render-version.ts`).
