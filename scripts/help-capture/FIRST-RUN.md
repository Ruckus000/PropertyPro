# First capture run — known prerequisites

Until a shot is captured, its article renders that step without an image
(`guard:help-content` reports how many are pending). This is what a capture
run needs beyond a seeded app, and what is still uncaptured.

## Setup

What worked on 2026-09-30 (cloud container, Node 22):

```
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npm_config_loglevel=error pnpm agent:env:prepare
npm_config_loglevel=error scripts/agent-env.sh exec pnpm help:capture:fixtures
node apps/web/scripts/sync-pdfjs-assets.mjs            # agent:live:web skips predev, so /pdfjs is missing
npm_config_loglevel=error pnpm agent:live:web          # prints web=http://localhost:<port>
HELP_CAPTURE_BASE_URL=http://127.0.0.1:<port> HELP_CAPTURE_CHROMIUM=<chromium binary> \
  HELP_CAPTURE_COMMUNITY_IDS=condo=1,hoa=2,apartment=3 pnpm help:capture --all
```

`docker.io` because the egress proxy refused public.ecr.aws's CDN;
`npm_config_loglevel=error` because pnpm's engine warning (the repo wants Node
24) otherwise lands in `supabase status -o env` and breaks the env file. Review
the images afterwards: a shot can pass and still show a loading state.

- `pnpm dev` with the demo seed; `DATABASE_URL` pointing at it (or
  `HELP_CAPTURE_COMMUNITY_IDS="condo=…,hoa=…,apartment=…"`).
- `pnpm demo:enable-gates` — online payments and violation fines are off by
  default (`pay-now`, `pay-form`, `vi-fine`). Payments also need a Stripe
  publishable key.
- Texting on for the community plus `SMS_DISPATCH_ENABLED=true` (`em-r`).
- `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` off for the getting-started help-panel
  shots (they show the legacy panel's labels).
- `pnpm help:capture:fixtures` after the seed (local databases only; safe to
  re-run). It adds the rows listed under "Seed data" that the seed lacks, and
  switches `electionsAttorneyReviewed` on for Sunset Condos with a draft, an
  open and a closed election (`el-actions`, `el-results`, `bal-cast`).

## Personas

- **`boardOnly` resident articles use `board_member`** — seeded as an owner
  with a board seat at Sunset Condos (unit 2 by number). `board_president` is a
  manager with a designation and sees manager screens.
- Resident packages/visitors use `tenant` at the condo (no apartment resident
  persona exists).

## Seed data the shots expect but the seed does not create

`pnpm help:capture:fixtures` creates pending packages and an expected visitor
(`pk-*`, `vs-*`), a move-in checklist (`mio-*`), a contract near expiry with
bids (`ct-*`), an active poll (`poll-vote`), a policy with an agent email
(`ins-coi`), the digest turned on (`dig-card`), a pinned announcement outside
the demo registry (`dash-ann`, `an-*`), an access request (`jr-*`), an ARC
submission (`arcr-*`), elections (`el-*`, `bal-cast`), a meeting this month
(`mt-day`), a past meeting with minutes (`mt-past`, `min-list`), a forum
thread (`fr-list`), reserve assets (`rv-list`), a storm report (`st-list`), a
condo maintenance request (`wo-inbox`, `mr-list`) and a wind-mitigation report
(`ins-wind`). The demo seed itself is unchanged.

## Date-sensitive fills

- `vi-hear` fills `2026-10-08` (must be within 14 days of capture for the
  warning); `mt-warn` fills `2026-10-02T12:00`. Update both before capturing.

## Selectors to confirm

- `button[aria-label*="— Noise"]`, `button[aria-label*="— Unauthorized Modification"]`
- `nav[aria-label="Board sections"] + div`
- `div.space-y-4:has(> div.rounded-lg > div > span:text-is("Quorum"))`
- `article[role="button"]:has-text("closed")`
- `role=dialog >> role=combobox` (poll type)
- `div.absolute.inset-0 > button >> nth=0` (first e-sign field)
- `div.xl\:col-span-2` (`snd-track`)
- `main div.overflow-hidden > button >> nth=0` (first FAQ)
- `[data-radix-popper-content-wrapper]`, `details[open]`,
  `role=region[name=/Setup checklist/]`
- Regex role selectors: `/^All$/`, `/^Check In$/`, `/^Revoke$/`,
  `/^Actions for /`, `/^Bulk announcement/`
- Tall crops (`rv-list`, the board roster) are clipped to the 1440×900
  viewport; tighten `clipTo` if an image goes over 250 KB.

## Keeping shots current

Nothing checks a shot against the UI it shows. `media-index.json` records each
shot's capture date (`[width, height, "YYYY-MM-DD"]`). Re-run
`pnpm help:capture --all` before a release and after changing a screen a guide
shows, then review the images by eye: an empty state or a loading skeleton
still passes the capture.

## Deliberately not captured

- Account deletion and emergency-broadcast undo: capturing them would schedule
  a deletion or send an alert.

## Status after the 2026-10-01 capture run

227 of 232 shots are captured against the seeded local app with the fixtures
above, and each was reviewed by eye. These 5 are not; their steps render
text-only:

| Article | Shot | Why |
|---|---|---|
| `manager/website/transparency-page` | `tp-public` | The public page is host-based (`<slug>.localhost/transparency`); manifests take a path only. |
| `resident/documents/find-documents` | `doc-cats-apt` | No apartment resident persona in `/dev/agent-login`. |
| `resident/emergency/emergency-alerts` | `em-r` | Needs `SMS_DISPATCH_ENABLED=true`, which makes an accidental send real. |
| `resident/payments/balance` | `bal-clear` | No persona has a cleared balance; Palm Shores' plan has no finance. |
| `resident/payments/pay-dues` | `pay-form` | Needs Stripe keys and a connected account. |

Captured but showing an honest empty state: `ntf-center` (no notifications
yet), `pay-hist` (no payments yet), `vs-deny` (the step is the add button) and
`gap-over` (nothing overdue in the demo).
