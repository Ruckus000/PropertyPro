# First capture run — known prerequisites

The manifests here were written against the code, not against a
running app: none has been captured yet. Until a shot is captured, its article
renders that step without an image (`guard:help-content` reports how many are
pending). This list is what the authors could not confirm without a seeded app.
Delete entries as they are resolved; delete this file when every shot has
captured cleanly.

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
(`mt-day`) and a past meeting with minutes (`mt-past`, `min-list`). Still
missing:

- Forum threads and join requests.
- Maintenance requests and work orders (`mr-list`, `wo-inbox`).
- Storm reports (`st-list`), reserve assets (`rv-list`).
- Something waiting for signature (`dash-sign`), an unfinished setup
  checklist (`dash-check`), an audit entry with metadata (`au-meta`), a seeded
  violation on owner.one's unit (`vn-notice`).
- `pm_admin` needs a billing group for `ob-add`, `ob-form`, `ob-plan`.

## Date-sensitive fills

- `vi-hear` fills `2026-10-08` (must be within 14 days of capture for the
  warning); `mt-warn` fills `2026-10-03T18:00`. Update both before capturing.

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

## Status after the 2026-09-30 capture run

171 of 230 shots are captured against the seeded local app (condo=1, hoa=2, apartment=3) and were reviewed by eye. These 59 are not, and their steps render text-only until they are:

| Article | Shot | Why |
|---|---|---|
| `manager/announcements/post-announcement` | `an-publish` | crop target empty or off-screen |
| `manager/apartment/packages` | `pk-pending` | target never appeared: missing seed data (see above) or selector |
| `manager/apartment/packages` | `pk-pickup` | target never appeared: missing seed data (see above) or selector |
| `manager/apartment/visitors` | `vs-list` | target never appeared: missing seed data (see above) or selector |
| `manager/apartment/visitors` | `vs-revoke` | target never appeared: missing seed data (see above) or selector |
| `manager/apartment/visitors` | `vs-deny` | captured a loading skeleton (removed) |
| `manager/board/run-election` | `el-actions` | crop landed on the dialog backdrop (removed) |
| `manager/board/run-election` | `el-results` | target never appeared: missing seed data (see above) or selector |
| `manager/compliance/compliance-dashboard` | `cp-upload` | captured the modal while loading (removed) |
| `manager/documents/find-documents` | `doc-row` | crop target empty or off-screen |
| `manager/documents/find-documents` | `doc-dl` | crop target empty or off-screen |
| `manager/documents/find-documents` | `doc-viewer` | crop target empty or off-screen |
| `manager/emergency/emergency-broadcast` | `em-stats` | target never appeared: missing seed data (see above) or selector |
| `manager/getting-started/getting-around` | `gs-helppanel` | panel crop only 24–59px wide (removed) |
| `manager/getting-started/your-dashboard` | `dash-sign` | target never appeared: missing seed data (see above) or selector |
| `manager/leases/move-in-out` | `mio-list` | target never appeared: missing seed data (see above) or selector |
| `manager/leases/move-in-out` | `mio-card` | target never appeared: missing seed data (see above) or selector |
| `manager/meetings/meeting-notices` | `mt-day` | click target missing |
| `manager/meetings/meeting-notices` | `mt-detail` | click target missing |
| `manager/meetings/post-minutes` | `min-author` | click target missing |
| `manager/meetings/schedule-meeting` | `mt-deadlines` | click target missing |
| `manager/pm/roles-access` | `ra-board` | crop target empty or off-screen |
| `manager/residents/join-requests` | `jr-queue` | target never appeared: missing seed data (see above) or selector |
| `manager/residents/join-requests` | `jr-deny` | click target missing |
| `manager/violations/arc-review` | `arcr-queue` | target never appeared: missing seed data (see above) or selector |
| `manager/violations/arc-review` | `arcr-panel` | target never appeared: missing seed data (see above) or selector |
| `manager/violations/arc-review` | `arcr-decide` | target never appeared: missing seed data (see above) or selector |
| `manager/violations/review-violations` | `vi-notice` | crop landed on the sidebar (removed) |
| `manager/website/contracts` | `ct-alerts` | target never appeared: missing seed data (see above) or selector |
| `manager/website/contracts` | `ct-bids` | target never appeared: missing seed data (see above) or selector |
| `manager/website/export-data` | `exp-page` | target never appeared: missing seed data (see above) or selector |
| `manager/website/transparency-page` | `tp-public` | target never appeared: missing seed data (see above) or selector |
| `resident/account/export-data` | `exp-page` | target never appeared: missing seed data (see above) or selector |
| `resident/announcements/read-announcements` | `an-list` | target never appeared: missing seed data (see above) or selector |
| `resident/announcements/read-announcements` | `an-pin` | target never appeared: missing seed data (see above) or selector |
| `resident/board/cast-ballot` | `bal-cast` | target never appeared: missing seed data (see above) or selector |
| `resident/board/run-election` | `el-actions` | crop landed on the dialog backdrop (removed) |
| `resident/board/run-election` | `el-results` | target never appeared: missing seed data (see above) or selector |
| `resident/board/vote-poll` | `poll-vote` | target never appeared: missing seed data (see above) or selector |
| `resident/building/insurance` | `ins-coi` | target never appeared: missing seed data (see above) or selector |
| `resident/documents/find-documents` | `doc-row` | crop target empty or off-screen |
| `resident/documents/find-documents` | `doc-dl` | crop target empty or off-screen |
| `resident/documents/find-documents` | `doc-viewer` | crop target empty or off-screen |
| `resident/documents/find-documents` | `doc-cats-apt` | target never appeared: missing seed data (see above) or selector |
| `resident/emergency/emergency-alerts` | `em-r` | target never appeared: missing seed data (see above) or selector |
| `resident/esign/sign-document` | `sg-card` | crop target empty or off-screen |
| `resident/esign/sign-document` | `sg-field` | target never appeared: missing seed data (see above) or selector |
| `resident/esign/sign-document` | `sg-modal` | target never appeared: missing seed data (see above) or selector |
| `resident/esign/sign-document` | `sg-finish` | target never appeared: missing seed data (see above) or selector |
| `resident/getting-started/community-digest` | `dig-card` | target never appeared: missing seed data (see above) or selector |
| `resident/getting-started/getting-around` | `gs-helppanel` | panel crop only 24–59px wide (removed) |
| `resident/getting-started/join-community` | `gs-join-unit` | target never appeared: missing seed data (see above) or selector |
| `resident/getting-started/join-community` | `gs-join-submit` | target never appeared: missing seed data (see above) or selector |
| `resident/getting-started/your-dashboard` | `dash-sign` | target never appeared: missing seed data (see above) or selector |
| `resident/meetings/meeting-notices` | `mt-day` | click target missing |
| `resident/meetings/meeting-notices` | `mt-detail` | click target missing |
| `resident/payments/balance` | `bal-clear` | target never appeared: missing seed data (see above) or selector |
| `resident/payments/pay-dues` | `pay-form` | target never appeared: missing seed data (see above) or selector |
| `resident/violations/violation-notice` | `vn-notice` | target never appeared: missing seed data (see above) or selector |
