import '@testing-library/jest-dom/vitest';
import * as vitestAxeMatchers from 'vitest-axe/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

expect.extend(vitestAxeMatchers);

// PdfViewer uses a runtime-only `import('/pdfjs/pdf.mjs')` from a same-origin
// public asset path. Vite cannot statically resolve that path during test
// transform, which breaks any test that transitively imports DocumentViewer.
// Stub it globally so test files don't have to mock it individually. Per-file
// vi.mock calls (e.g. in document-viewer.test.tsx) still take precedence.
vi.mock('@/components/pdf/pdf-viewer', () => ({
  PdfViewer: () => null,
}));

// The lapsed read-entitlement guard reads the DB via createUnscopedClient, so
// importing it pulls in `@propertypro/db` (which throws "Missing DATABASE_URL"
// when the unit-test job has no database, and otherwise silently hits the real
// DB). Route unit tests don't provision that and shouldn't exercise the guard —
// its behavior is covered by read-entitlement-guard.test.ts (real impl) and a
// DB-backed integration test. No-op it globally so every gated route's GET test
// stays hermetic. Per-file vi.mock still takes precedence: ledger-route.test.ts
// asserts it IS called, and read-entitlement-guard.test.ts restores the real
// implementation via vi.mock(..., importActual).
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: vi.fn(),
}));

afterEach(() => {
  cleanup();
});
