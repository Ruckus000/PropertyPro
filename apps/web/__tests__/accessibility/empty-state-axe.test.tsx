/**
 * axe audit of the empty-state scene sizes (docs/design-system/patterns/empty-states.md §6.3).
 *
 * Each case first asserts that the thing it audits rendered (an axe run over
 * an empty container passes), then a paired probe breaks one element in the
 * same layout slot and shows axe goes red there. A probe proves axe reached
 * that slot; it does not repeat the clean case.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { DirectoryScene, DocumentsScene, StormCalmScene } from '@propertypro/ui';
import { EmptyState } from '@/components/shared/empty-state';

const ruleIds = async (container: HTMLElement) =>
  (await axe(container)).violations.map((v) => v.id);

function HeroAside({ helpLabel }: { helpLabel?: string }) {
  return (
    <section aria-labelledby="ctx-help">
      <h3 id="ctx-help">Help</h3>
      <ul>
        <li>
          <a href="/help/manager/documents/upload-document">{helpLabel ?? 'Upload a document'}</a>
        </li>
      </ul>
    </section>
  );
}

describe('EmptyState scene sizes — axe', () => {
  it('hero with art and a context column has no violations', async () => {
    const { container } = render(
      <EmptyState
        size="hero"
        eyebrow="Documents"
        title="Your association's documents will appear here"
        description="When your board posts a document you can open, it lands here."
        illustration={<DocumentsScene size="hero" />}
        aside={<HeroAside />}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: /documents will appear here/ })).toBeTruthy();
    // The wrapper must pass the eyebrow through (it renders the ui component, not the ui tests).
    expect(screen.getByText('Documents').tagName).toBe('P');
    expect(screen.getByRole('heading', { level: 3, name: 'Help' })).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: hero — an unnamed link in the context column is caught', async () => {
    const { container } = render(
      <EmptyState size="hero" title="T" illustration={<DocumentsScene size="hero" />} aside={<HeroAside helpLabel="" />} />,
    );
    expect(await ruleIds(container)).toContain('link-name');
  });

  it('section with art and an action has no violations', async () => {
    const { container } = render(
      <EmptyState
        size="section"
        title="Units you add appear here"
        illustration={<DirectoryScene size="section" />}
        action={<button type="button">Add unit</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Units you add appear here' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add unit' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: section — an unnamed action button is caught', async () => {
    const { container } = render(
      <EmptyState size="section" title="T" illustration={<DirectoryScene size="section" />} action={<button type="button" />} />,
    );
    expect(await ruleIds(container)).toContain('button-name');
  });

  it('compact with art and a link has no violations', async () => {
    const { container } = render(
      <EmptyState
        size="compact"
        title="No damage reports yet"
        illustration={<StormCalmScene size="compact" />}
        action={<a href="/storm-damage">Open storm damage</a>}
      />,
    );
    expect(screen.getByText('No damage reports yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open storm damage' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: compact — art exposed as an unnamed image is caught', async () => {
    const { container } = render(
      <EmptyState
        size="compact"
        title="T"
        illustration={
          <svg role="img" viewBox="0 0 64 64">
            <rect width={64} height={64} />
          </svg>
        }
      />,
    );
    expect(await ruleIds(container)).toContain('svg-img-alt');
  });
});

describe('EmptyState web wrapper — prop families', () => {
  it('rejects a scene prop on an icon size, and an icon on a scene size (compile time)', () => {
    // Checked by `pnpm typecheck` (this file is in apps/web's tsconfig). If the
    // wrapper's props stop splitting by size, these directives become unused
    // and typecheck fails; the art would otherwise be dropped silently.
    // @ts-expect-error illustration needs size hero, section or compact
    const iconWithArt = <EmptyState size="md" title="T" illustration={<DocumentsScene />} />;
    // @ts-expect-error icon is for sm, md and lg only
    const sceneWithIcon = <EmptyState size="hero" title="T" icon="upload" />;
    // @ts-expect-error a preset carries its own icon
    const presetWithIcon = <EmptyState preset="no_results" icon="upload" />;
    expect([iconWithArt, sceneWithIcon, presetWithIcon]).toHaveLength(3);
  });
});
