# First capture run — known prerequisites

The manifests here were written against the code, not against a
running app: none has been captured yet. Until a shot is captured, its article
renders that step without an image (`guard:help-content` reports how many are
pending). This list is what the authors could not confirm without a seeded app.
Delete entries as they are resolved; delete this file when every shot has
captured cleanly.

## Setup

- `pnpm dev` with the demo seed; `DATABASE_URL` pointing at it (or
  `HELP_CAPTURE_COMMUNITY_IDS="condo=…,hoa=…,apartment=…"`).
- `pnpm demo:enable-gates` — online payments and violation fines are off by
  default (`pay-now`, `pay-form`, `vi-fine`). Payments also need a Stripe
  publishable key.
- Texting on for the community plus `SMS_DISPATCH_ENABLED=true` (`em-r`).
- `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` off for the getting-started help-panel
  shots (they show the legacy panel's labels).
- `electionsAttorneyReviewed` switched on for Sunset Condos, plus a draft and a
  closed election (`el-actions`, `el-results`).

## Personas

- **`boardOnly` resident articles use `board_member`** — seeded as an owner
  with a board seat at Sunset Condos (unit 2 by number). `board_president` is a
  manager with a designation and sees manager screens.
- Resident packages/visitors use `tenant` at the condo (no apartment resident
  persona exists).

## Seed data the shots expect but the seed does not create

- Move-in/out checklists at Sunset Ridge (`mio-card`): create or renew one
  lease through the UI first.
- Polls, forum threads, ARC submissions, access and join requests.
- Maintenance requests and work orders (`mr-list`, `wo-inbox`).
- Past meetings (`mt-past`, `min-list`); a meeting in the current month
  (`mt-day`).
- Storm reports (`st-list`), a pending package (`pk-pending`, `pk-pickup`),
  expected visitors (`vs-list`, `vs-revoke`), reserve assets (`rv-list`), a
  policy with an agent email (`ins-coi`).
- Something waiting for signature (`dash-sign`), an unfinished setup
  checklist (`dash-check`), contracts near expiry and with bids (`ct-alerts`,
  `ct-bids`), an audit entry with metadata (`au-meta`), the digest already on
  (`dig-card`), a seeded violation on owner.one's unit (`vn-notice`).
- `pm_admin` needs a billing group for `ob-add`, `ob-form`, `ob-plan`.

## Date-sensitive fills

- `vi-hear` fills `2026-10-06` (must be within 14 days of capture for the
  warning); `mt-warn` fills `2026-10-01T18:00`. Update both before capturing.

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

## Deliberately not captured

- Account deletion and emergency-broadcast undo: capturing them would schedule
  a deletion or send an alert.
