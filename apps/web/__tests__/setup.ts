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

afterEach(() => {
  cleanup();
});
