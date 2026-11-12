/**
 * Compliance "Getting Started" panel (empty-state audit, 2026-11-11).
 *
 * Three shipped defects, one block each:
 *   - HOA priority keys named template keys that do not exist, so an HOA got a
 *     single step. The keys are now checked against the real HOA template.
 *   - Satisfied items were dropped before progress was counted, so "Done" and
 *     the progress dots could never render.
 *   - Dismissal used one global localStorage key, so skipping the panel for one
 *     community hid it for every community.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CONDO_718_CHECKLIST_TEMPLATE,
  HOA_720_CHECKLIST_TEMPLATE,
} from '@propertypro/shared';
import {
  ComplianceOnboarding,
  getPriorityItems,
  onboardingDismissedKey,
  PRIORITY_KEYS,
  shouldShowOnboarding,
} from '../../src/components/compliance/compliance-onboarding';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';

function checklistFrom(
  template: readonly { templateKey: string; title: string; description: string }[],
  satisfiedKeys: string[] = [],
): ChecklistItemData[] {
  return template.map((t, index) => {
    const satisfied = satisfiedKeys.includes(t.templateKey);
    return {
      id: index + 1,
      templateKey: t.templateKey,
      title: t.title,
      description: t.description,
      documentId: satisfied ? 100 + index : null,
      status: satisfied ? 'satisfied' : 'unsatisfied',
    } as ChecklistItemData;
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('priority keys', () => {
  it('every priority key exists in the condo or HOA template', () => {
    const real = new Set(
      [...CONDO_718_CHECKLIST_TEMPLATE, ...HOA_720_CHECKLIST_TEMPLATE].map((t) => t.templateKey),
    );
    expect(PRIORITY_KEYS.filter((key) => !real.has(key))).toEqual([]);
  });

  it('gives an HOA its three governing-document steps, declaration first', () => {
    const steps = getPriorityItems(checklistFrom(HOA_720_CHECKLIST_TEMPLATE));
    expect(steps.map((i) => i.templateKey)).toEqual([
      '720_governing_docs',
      '720_bylaws_rules',
      '720_articles',
    ]);
  });

  it('gives a condo its four governing-document steps', () => {
    const steps = getPriorityItems(checklistFrom(CONDO_718_CHECKLIST_TEMPLATE));
    expect(steps.map((i) => i.templateKey)).toEqual([
      '718_declaration',
      '718_bylaws',
      '718_articles',
      '718_rules',
    ]);
  });
});

describe('progress', () => {
  it('keeps a satisfied step in the list and marks it Done', () => {
    const items = checklistFrom(CONDO_718_CHECKLIST_TEMPLATE, ['718_bylaws']);

    render(<ComplianceOnboarding communityId={1} items={items} onUpload={vi.fn()} />);

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /upload/i })).toHaveLength(3);
    expect(screen.getByText('1 of 4 done')).toBeTruthy();
    const dots = document.querySelectorAll('[data-step-done]');
    expect([...dots].map((d) => d.getAttribute('data-step-done'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('hides the panel once every step is done', () => {
    const items = checklistFrom(CONDO_718_CHECKLIST_TEMPLATE, [
      '718_declaration',
      '718_bylaws',
      '718_articles',
      '718_rules',
    ]);
    expect(shouldShowOnboarding(items)).toBe(false);
  });

  it('hides the panel once a record outside the steps has a file', () => {
    const items = checklistFrom(CONDO_718_CHECKLIST_TEMPLATE, ['718_budget']);
    expect(shouldShowOnboarding(items)).toBe(false);
  });

  it('shows the panel on a brand-new checklist', () => {
    expect(shouldShowOnboarding(checklistFrom(HOA_720_CHECKLIST_TEMPLATE))).toBe(true);
  });
});

describe('dismissal', () => {
  it('is remembered for the community it was dismissed in, and only that one', () => {
    const items = checklistFrom(CONDO_718_CHECKLIST_TEMPLATE);

    const first = render(<ComplianceOnboarding communityId={1} items={items} onUpload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss onboarding' }));
    expect(screen.queryByText('Getting Started')).toBeNull();
    expect(window.localStorage.getItem(onboardingDismissedKey(1))).toBe('true');
    first.unmount();

    render(<ComplianceOnboarding communityId={2} items={items} onUpload={vi.fn()} />);
    expect(screen.getByText('Getting Started')).toBeTruthy();
  });

  it('stays dismissed when the same community is opened again', () => {
    window.localStorage.setItem(onboardingDismissedKey(1), 'true');

    render(
      <ComplianceOnboarding
        communityId={1}
        items={checklistFrom(CONDO_718_CHECKLIST_TEMPLATE)}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.queryByText('Getting Started')).toBeNull();
  });
});
