// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DirectoryScene, DocumentsScene, ProgressRing, StormCalmScene } from '..';

const SCENES = { DocumentsScene, DirectoryScene, StormCalmScene } as const;
const SIZES = ['hero', 'section', 'compact'] as const;

describe('empty-state scenes', () => {
  for (const [name, SceneComponent] of Object.entries(SCENES)) {
    for (const size of SIZES) {
      it(`${name} at ${size} is decorative and paints only with custom properties`, () => {
        const { container } = render(<SceneComponent size={size} />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        expect(svg?.getAttribute('focusable')).toBe('false');
        expect(svg?.getAttribute('role')).toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe(size === 'compact' ? '0 0 64 64' : '0 0 340 230');

        // Anti-vacuity: a scene that rendered nothing would pass the paint check below.
        const painted = [...container.querySelectorAll('[fill], [stroke]')];
        expect(painted.length).toBeGreaterThan(3);
        for (const el of painted) {
          for (const attr of ['fill', 'stroke'] as const) {
            const value = el.getAttribute(attr);
            if (value === null || value === 'none') continue;
            expect(value, `${name} ${size} <${el.tagName}> ${attr}`).toMatch(/^var\(--[a-z]+-\d+\)$/);
          }
        }
      });
    }
  }

  it('compact drops the landscape: no ground band', () => {
    const hero = render(<DocumentsScene size="hero" />).container;
    const compact = render(<DocumentsScene size="compact" />).container;
    const ground = (c: HTMLElement) =>
      [...c.querySelectorAll('rect')].filter((r) => r.getAttribute('width') === '340').length;
    expect(ground(hero)).toBe(1);
    expect(ground(compact)).toBe(0);
  });

  it('never labels the art for assistive tech', () => {
    const { container } = render(<StormCalmScene />);
    expect(container.querySelector('title, desc, [aria-label]')).toBeNull();
  });
});

describe('ProgressRing', () => {
  const arc = (c: HTMLElement) => c.querySelectorAll('circle')[1];

  it('draws only the track at zero', () => {
    const { container } = render(<ProgressRing done={0} total={13} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('draws only the track when nothing counts', () => {
    const { container } = render(<ProgressRing done={0} total={0} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('draws an arc proportional to done / total, in the theme primary', () => {
    const { container } = render(<ProgressRing done={4} total={13} />);
    const circumference = 2 * Math.PI * 17;
    const [length] = (arc(container)?.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(length).toBeCloseTo((4 / 13) * circumference, 5);
    expect(arc(container)?.getAttribute('stroke')).toBe('var(--interactive-primary)');
  });

  it('clamps at a full ring', () => {
    const { container } = render(<ProgressRing done={20} total={13} />);
    const [length] = (arc(container)?.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(length).toBeCloseTo(2 * Math.PI * 17, 5);
  });

  it('is decorative', () => {
    const { container } = render(<ProgressRing done={1} total={2} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
