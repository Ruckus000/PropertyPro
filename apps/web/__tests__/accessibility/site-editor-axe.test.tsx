/**
 * Accessibility audit — website editor v3 surfaces.
 *
 * A sibling of `axe-audit.test.tsx` rather than an extension of it. The editor's
 * surfaces need `@/hooks/use-content-blocks` mocked, and `vi.mock` is
 * file-scoped and hoisted — adding that mock to `axe-audit.test.tsx` would
 * silently apply it to the auth, maintenance, marketing and settings suites
 * that share the file.
 *
 * The surfaces are rendered inside a REAL `SiteEditorProvider`, not a mocked
 * context, because the thing under test here is the composed accessibility tree
 * (the live region, the section grouping, the inspector's landmark) rather than
 * any single component's markup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SiteEditorProvider } from '@/components/pm/site-editor-v3/editor-context';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';
import { Inspector } from '@/components/pm/site-editor-v3/Inspector';
import { SectionShell } from '@/components/pm/site-editor-v3/canvas/SectionShell';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// Mock this module COMPLETELY. A partial factory here fails only at module
// load, and only for whichever component reaches the missing export — so it
// reads as an unrelated component breaking rather than a mock being short.
// Anything FloatControls' undo path reaches has to be listed.
vi.mock('@/hooks/use-content-blocks', () => ({
  useReorderBlocks: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// The inspector docks at >=1280px; false = wide. Both modes are audited.
const isNarrowMock = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => isNarrowMock.value,
  useIsDesktop: () => !isNarrowMock.value,
}));

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    blockType: 'text',
    blockOrder: overrides.id,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

const BLOCKS: SiteBlockSummary[] = [
  block({ id: 1, blockType: 'hero', blockOrder: 1 }),
  block({ id: 2, blockType: 'text', blockOrder: 2 }),
  block({ id: 3, blockType: 'image', blockOrder: 3, isDraft: true }),
  block({ id: 4, blockType: 'faq', blockOrder: 4 }),
];

function renderEditorSurfaces() {
  return render(
    <SiteEditorProvider communityId={7} blocks={BLOCKS}>
      <div>
        <SectionList />
        <div>
          {BLOCKS.map((b) => (
            <SectionShell key={b.id} block={b} communityId={7}>
              <p>{b.blockType} section body</p>
            </SectionShell>
          ))}
        </div>
        <Inspector />
      </div>
    </SiteEditorProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isNarrowMock.value = false;
});

describe('Website editor v3 — axe', () => {
  it('has no violations with nothing selected', async () => {
    const { container } = renderEditorSurfaces();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with a section selected (docked inspector)', async () => {
    const user = userEvent.setup();
    const { container } = renderEditorSurfaces();

    await user.click(screen.getByRole('group', { name: 'Text section' }));
    // The inspector is now open as a docked landmark.
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with a section selected (overlay inspector)', async () => {
    isNarrowMock.value = true;
    const user = userEvent.setup();
    const { baseElement } = renderEditorSurfaces();

    await user.click(screen.getByRole('group', { name: 'Text section' }));
    // The overlay is code-split; auditing before it resolves would audit an
    // empty placeholder and pass for the wrong reason.
    await screen.findByRole('dialog');

    // Radix portals the sheet outside the container, so audit baseElement.
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
