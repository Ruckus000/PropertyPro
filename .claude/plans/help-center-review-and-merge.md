# Help Center: PR Review, Fix, Preview Test, and Merge to Main

## Context

The `claude/vibrant-wozniak` worktree at `/Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/vibrant-wozniak` has a complete help center implementation across 15 commits (base SHA `7ab0b26`, HEAD ~`936839c`). All 15 tasks from `docs/superpowers/plans/2026-04-13-help-center.md` are implemented. Typecheck, lint, unit tests, and production build all pass.

## What to do

Execute these phases in order. Do not skip any phase.

### Phase 1: Create PR for Gemini Review

1. Push the `claude/vibrant-wozniak` branch to origin
2. Create a PR against `main` with a summary of all 15 tasks
3. Comment `/gemini review` on the PR
4. Wait 5 minutes for Gemini Code Assist to post its review
5. Read the Gemini review comments using `gh api`

### Phase 2: Address Gemini Findings

1. Read every Gemini comment carefully
2. Fix all legitimate issues (bugs, security, correctness, missing error handling)
3. Dismiss cosmetic/style-only suggestions that don't improve correctness
4. Commit fixes with descriptive messages
5. Push fixes to the PR branch
6. Comment `/gemini review` again
7. Wait 5 minutes and re-read — repeat until Gemini has no real points left

### Phase 3: Preview Testing

Use the agent-testing pattern from `.claude/rules/agent-testing.md`. Do NOT read `.env.local`.

1. Start the dev server: `preview_start("web")`
2. Log in as `owner`: `preview_eval: window.location.href = '/dev/agent-login?as=owner'`
3. Verify with `preview_snapshot()`

Test each help center surface:

**Help Hub (`/help`):**
- Navigate to `/help`, take screenshot
- Verify: search bar, featured quick links (4 articles), category cards, community FAQs accordion
- Click a featured article link — verify it navigates to the article page

**Article Page (`/help/[category]/[slug]`):**
- Verify: breadcrumb, title, description, read time, role badges, MDX content renders (Callout, StepByStep components), related articles section
- Take screenshot

**Category Page (`/help/[category]`):**
- Navigate to `/help/compliance`, verify article list with read times and role badges

**Search (`/help/search?q=compliance`):**
- Navigate to search, verify results show "Platform Guides" section

**Help Widget:**
- Click the `?` button in the top bar
- Verify the slide-out drawer opens with search and contextual suggestions
- Search for "compliance" in the widget — verify results appear
- Close the widget

**Profile Menu:**
- Open profile dropdown, verify "Help" link exists

**Mobile Help:**
- Log in as `owner`, navigate to `/mobile/help`
- Verify "Quick Guides" section appears with featured articles

**Admin features:**
- Log in as `cam`: `preview_eval: window.location.href = '/dev/agent-login?as=cam'`
- Navigate to `/help` — verify "Manage FAQs" link appears
- Navigate to `/help/manage` — verify FAQ list renders

### Phase 4: CI Verification

1. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`
2. Check GitHub CI status: `gh pr checks <PR-NUMBER>`
3. If any CI job fails, fix and push

### Phase 5: Merge to Main

1. Confirm all CI checks pass
2. Confirm Gemini review has no outstanding real issues
3. Confirm preview testing passed
4. Merge the PR: `gh pr merge <PR-NUMBER> --squash --delete-branch`
5. Verify merge succeeded

## Files changed (summary)

**22 new files:** 7 MDX articles, 1 migration, 1 service, 2 API routes, 5 pages, 5 components, 1 hook
**11 modified files:** middleware, nav-config, app-shell, app-top-bar, profile-menu, mobile help page/component, default-faqs, faq-service, faqs schema, package.json

## Design spec

Full spec at `docs/superpowers/specs/2026-04-13-help-center-design.md`

## Symlinks needed

The worktree needs `.env.local` symlinked for builds:
```bash
ln -sf /Users/jphilistin/Documents/Coding/PropertyPro/.env.local /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/vibrant-wozniak/.env.local
ln -sf /Users/jphilistin/Documents/Coding/PropertyPro/.env.local /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/vibrant-wozniak/apps/web/.env.local
ln -sf /Users/jphilistin/Documents/Coding/PropertyPro/.env.local /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/vibrant-wozniak/apps/admin/.env.local
```
These are already in place from the current session but may need re-creation if the worktree was cleaned.
