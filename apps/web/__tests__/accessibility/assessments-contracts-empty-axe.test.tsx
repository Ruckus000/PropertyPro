/**
 * axe audit of the Assessments and Contracts & Vendors first-run heroes
 * (plan docs/superpowers/plans/2026-11-20-empty-states-amenities-vendors-assessments.md A1, A4).
 *
 * Each case first asserts the hero rendered (an axe run over an empty container
 * passes). Each probe then plants one unnamed button inside that hero's context
 * column and shows axe reports it, proving the audit reached that subtree.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { AssessmentsFirstRun } from '@/components/finance/assessments-empty';
import { ContractsFirstRun } from '@/components/contracts/contracts-empty';

const ruleIds = async (container: HTMLElement) =>
  (await axe(container)).violations.map((v) => v.id);

function plantUnnamedButton(container: HTMLElement, sectionTitle: string) {
  const heading = screen.getByRole('heading', { level: 3, name: sectionTitle });
  const section = heading.closest('section');
  if (!section) throw new Error(`no section around "${sectionTitle}"`);
  section.appendChild(document.createElement('button'));
  return container;
}

describe('first-run heroes — axe', () => {
  it('Assessments hero has no violations', async () => {
    const { container } = render(<AssessmentsFirstRun communityId={1} communityType="condo_718" onCreate={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Set up the dues your units pay' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'What an assessment has' })).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: Assessments — an unnamed button in the context column is caught', async () => {
    const { container } = render(<AssessmentsFirstRun communityId={1} communityType="condo_718" onCreate={() => {}} />);
    expect(await ruleIds(plantUnnamedButton(container, 'Who sees it'))).toContain('button-name');
  });

  it('Contracts & Vendors hero has no violations', async () => {
    const { container } = render(<ContractsFirstRun communityId={1} onAdd={() => {}} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Keep every vendor agreement in one place' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'What a contract has' })).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('probe: Contracts & Vendors — an unnamed button in the context column is caught', async () => {
    const { container } = render(<ContractsFirstRun communityId={1} onAdd={() => {}} />);
    expect(await ruleIds(plantUnnamedButton(container, 'Expiration Alerts'))).toContain('button-name');
  });
});
