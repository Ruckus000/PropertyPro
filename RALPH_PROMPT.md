You are implementing PropertyPro Florida. Read IMPLEMENTATION_PLAN.md and AGENTS.md.

Build and typecheck already pass. The remaining work is:

1. Create vitest test files for P0-01 (Design Tokens), P0-02 (Core Primitives), and P0-03 (Priority Components) per the acceptance criteria in IMPLEMENTATION_PLAN.md
2. Ensure pnpm test passes

Test locations:
- packages/ui/__tests__/primitives/ (Box, Stack, Text)
- packages/ui/__tests__/components/ (Button, Card, Badge, NavRail)
- Token tests: verify TypeScript constants match CSS variable names

Use @testing-library/react for component tests. Use Vitest, not Jest. No `any` or `@ts-ignore`.

When pnpm test passes, create RALPH_DONE.md summarizing what was completed.
