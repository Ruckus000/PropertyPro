# ADR-004: Help Content Authoring — MDX-in-Repo, with Loud Failures

- Status: Accepted
- Date: 2026-05-07
- Deciders: Engineering Lead
- Scope: How help center articles are authored, validated, and shipped. Where the source of truth for `featureGates` lives.

## Context

The 2026-05-07 help center audit surfaced two related problems with the
authoring model:

1. **Engineering bottleneck.** All 50 help articles live as `.mdx` files
   under `apps/web/src/content/help/`. Every typo fix is a code review and
   a Vercel deploy. The CAM and PM teams — the people closest to user pain
   — cannot iterate on the content themselves.
2. **Silent frontmatter failures.** `parseArticleFrontmatter()` coerced
   missing or malformed fields to defaults. A typo in `featureGates`
   (e.g. `hasComplaince`) silently caused the gate evaluator to return
   false, hiding the article from every community without surfacing an
   error. There was no CI check for: schema completeness, statute format,
   slug uniqueness, `relatedArticles` integrity, or staleness.

Two paths were considered for path 1:
- **A. Migrate to a CMS.** Move articles into a `help_articles` table and
  build an editor surface in `apps/admin` (currently infrastructure-only).
- **B. Keep MDX, make the failures loud.** Stay in-repo. Add a frontmatter
  schema, a CI guard, an author preview tool, and an ADR explaining why
  the model is what it is.

This ADR commits to path B.

## Decision

### Help articles stay in `apps/web/src/content/help/` as MDX files.

Article authoring continues to flow through the existing PR workflow.
Engineers stay in the loop, but the failure modes that previously trapped
typos at runtime now fail at PR time with a useful message.

### Frontmatter is validated by a Zod schema.

The schema lives at [`apps/web/src/lib/help/frontmatter-schema.ts`](apps/web/src/lib/help/frontmatter-schema.ts).
Both consumers use it:

- `parseArticleFrontmatter()` in
  [`apps/web/src/lib/services/help-article-service.ts`](apps/web/src/lib/services/help-article-service.ts)
  validates at runtime and **throws** with a descriptive error on any
  schema violation, replacing the prior silent string coercion.
- The CI guard at
  [`scripts/verify-help-content.ts`](scripts/verify-help-content.ts)
  runs the same schema across every MDX file in the help tree and adds
  cross-article checks the runtime parser cannot perform alone.

### `featureGates` strings are pinned to `CommunityFeatures`.

The schema's `featureGates` field is `z.enum(COMMUNITY_FEATURE_KEYS)`.
`COMMUNITY_FEATURE_KEYS` is a runtime mirror of the `CommunityFeatures`
TypeScript interface in
[`packages/shared/src/features/types.ts`](packages/shared/src/features/types.ts).
The CI guard verifies the two stay in sync: adding a flag to the
interface without updating the schema list (or vice versa) fails the
build with an explicit message.

This prevents the silent failure mode the audit flagged: a renamed flag
would have invalidated every article that referenced it, with no signal
beyond "no articles render for this community."

### CI guard `guard:help-content` enforces, in addition to the schema:

1. **Schema validity** — every `.mdx` parses against `helpFrontmatterSchema`.
2. **`featureGates` ↔ `CommunityFeatures` sync** — runtime list matches
   the source-of-truth interface.
3. **`relatedArticles` integrity** — every referenced slug resolves to
   another article in the help tree.
4. **`category` matches parent directory** — frontmatter cannot drift
   from filesystem layout.
5. **`slug` matches filename** — guards against the `category-page-rename`
   class of bug.
6. **Slug uniqueness** — no duplicate slugs across the tree.
7. **Statute format** — `statutes` entries match either `§NNN.NNN…` or
   `HB|SB NNNN` patterns. (Both forms appear in real Florida-compliance
   content per [`.claude/rules/florida-compliance.md`](.claude/rules/florida-compliance.md).)
8. **Staleness** — `updatedAt` older than 365 days fails as **error**;
   older than 180 days surfaces as **warning**. The intent is to make
   stale compliance content visible in CI, not to block routine PRs.

The guard is wired into `pnpm lint` (root `package.json`), running in
parallel with the other six guards on every PR.

### Authors get a local preview tool.

[`scripts/help-content-preview.ts`](scripts/help-content-preview.ts)
takes one or more file paths, validates them against the same schema,
and prints a per-file summary including word count and read time. No
dev server needed.

## Decision Drivers

- **Mechanism over guidance.** ADR-003 codified this principle: a rule
  documented in CLAUDE.md without a CI check decays. Every rule in this
  ADR has a corresponding check in `verify-help-content.ts`.
- **Loud failures are cheaper than CMS migration.** The CMS path
  delivers value (content velocity) but adds: a new admin surface, a new
  database table, an editor UI, draft/publish state machinery, content
  preview tooling, and a maintenance burden. The MDX path closes the
  silent-failure problem at a fraction of the cost.
- **Source of truth in one place.** `featureGates` strings either pin
  to `CommunityFeatures` or they drift. The runtime mirror plus CI
  drift-check is the same pattern used for the migration journal/snapshot
  lockstep in [`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts).
- **Don't penalize authors.** The preview script means non-engineers
  can validate frontmatter changes locally with a single command.

## Consequences

### Positive

- Frontmatter typos that previously hid articles silently now fail CI
  with a useful message naming the article and the field.
- The `featureGates` ↔ `CommunityFeatures` drift class — the highest-
  blast-radius failure mode the audit identified — is mechanically
  prevented.
- Authors keep their existing workflow. Engineers keep code review as
  the gate. No new app surface to operate.
- A staleness warning surfaces compliance content older than 180 days
  in CI output, without blocking shipment of unrelated changes.

### Negative / accepted

- Authoring still requires a PR + merge + Vercel deploy. The CMS path
  is not foreclosed; it's deferred until either (a) a clear authoring-
  velocity bottleneck appears in practice, or (b) we want to support
  community-specific content overrides that MDX cannot express.
- `COMMUNITY_FEATURE_KEYS` is a hand-maintained mirror. The CI guard
  catches drift, but the maintenance step is "add the new flag here too."
  This is acceptable because flag additions are rare events that already
  require care across the codebase.

## References

- Audit: 2026-05-07 four-perspective help center audit (UX, Chaos, DevOps,
  Systems).
- Frontmatter schema: [`apps/web/src/lib/help/frontmatter-schema.ts`](apps/web/src/lib/help/frontmatter-schema.ts)
- CI guard: [`scripts/verify-help-content.ts`](scripts/verify-help-content.ts)
- Author preview: [`scripts/help-content-preview.ts`](scripts/help-content-preview.ts)
- Snapshot/journal lockstep precedent: [`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts)
- Layering precedent: [ADR-003](docs/adr/ADR-003-layering-and-import-boundaries.md)
- Florida compliance bill references: [`.claude/rules/florida-compliance.md`](.claude/rules/florida-compliance.md)
