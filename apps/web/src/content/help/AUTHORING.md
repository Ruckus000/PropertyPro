# Help Content Authoring

## Media

- Use `<MediaFrame src alt width height caption? />` for screenshots and clips. Markdown `![...]` renders a basic framed image with NO layout-shift protection — avoid it for real media.
- Hero media goes in frontmatter `heroMedia: { src, alt, width, height, caption? }`.
- `upNext: <slug>` sets the footer "Up next" article.
- Assets live at `apps/web/public/help/<category>/<slug>/` and are referenced as `/help/<category>/<slug>/<name>.webp`. CI (`guard:help-content`) fails on missing files or budget violations (image ≤ 250KB, clip ≤ 1.5MB).
- Clips are short looping MP4s (≤ 8s), captured muted; always provide the `-poster.webp` as `poster=`.

## Capture

- Captures are scripted: `scripts/help-capture/manifests/<category>/<slug>.json`, run with `pnpm help:capture <category>/<slug>` against `pnpm dev` + seeded demo data (Sunset Condos). Roles via `/dev/agent-login` — see `.claude/rules/agent-testing.md` for the role list.
- Viewport 1440×900 @2x. Demo data only; never real-community data or PII.
- After any UI change that affects a captured page, re-run the manifest and re-commit the assets (the `HELP_RENDER_VERSION` bump in `apps/web/src/lib/help/render-version.ts` may also be needed if component markup changed).
- Requires: `pnpm dev` running, `ffmpeg` on PATH (`brew install ffmpeg`), `pnpm playwright:install` done once.

## Steps

- `<StepByStep>` + `<Step title image? imageAlt? imageWidth? imageHeight?>` — numbers render automatically; per-step screenshots use the same asset convention.
