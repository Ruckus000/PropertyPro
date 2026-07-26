/**
 * EditorFrame — the shell-less chrome.
 *
 * What matters here is what the route group gives up and what it keeps.
 * Decision B drops the app shell; decision B's amendment keeps the collapsed
 * sidebar. These tests pin both, plus the single `<main>` landmark that the
 * shell used to own.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CommunityFeatures } from '@propertypro/shared';
import { EditorFrame } from '@/components/pm/site-editor-v3/EditorFrame';

vi.mock('@/components/layout/app-sidebar', () => ({
  AppSidebar: (props: Record<string, unknown>) => (
    <nav
      aria-label="Main navigation"
      data-expanded-override={String(props['expandedOverride'])}
      data-show-collapse-toggle={String(props['showCollapseToggle'])}
      data-community-id={String(props['communityId'])}
    />
  ),
}));

const FEATURES = { hasSiteEditor: true } as unknown as CommunityFeatures;

function renderFrame(children?: React.ReactNode) {
  return render(
    <EditorFrame
      communityId={7}
      communityName="Sunset Condos"
      communityType="condo_718"
      role="property_manager"
      isUnitOwner={false}
      designation={null}
      features={FEATURES}
      userName="Jordan Rivera"
      plan="professional"
    >
      {children}
    </EditorFrame>,
  );
}

describe('EditorFrame', () => {
  it('renders exactly one main landmark', () => {
    renderFrame();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('keeps the main landmark as the skip-link target', () => {
    // The shell owned `#main-content`; without the shell this frame must.
    const { container } = renderFrame();
    expect(container.querySelector('main#main-content')).not.toBeNull();
  });

  it('renders the real sidebar, scoped to the target community', () => {
    renderFrame();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.dataset['communityId']).toBe('7');
  });

  it('pins the sidebar collapsed and hides the collapse toggle', () => {
    // Expanding to 260px would take a quarter of the canvas; gap analysis §9
    // row 2 chose the collapsed rail deliberately.
    renderFrame();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.dataset['expandedOverride']).toBe('false');
    expect(nav.dataset['showCollapseToggle']).toBe('false');
  });

  it('renders its children in the main region', () => {
    renderFrame(<p>editor body</p>);
    expect(screen.getByText('editor body')).toBeInTheDocument();
  });

  it('falls back to the placeholder when given no children', () => {
    renderFrame();
    expect(screen.getByRole('heading', { name: 'Website editor' })).toBeInTheDocument();
    expect(screen.getByText(/Sunset Condos/)).toBeInTheDocument();
  });
});
