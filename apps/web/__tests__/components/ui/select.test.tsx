import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';

afterEach(cleanup);

/**
 * SelectTrigger sits beside Input in every form, so it carries the Input's
 * treatment (packages/ui input.test.tsx pins that side): 44px on touch, 32px
 * from md, `rounded-sm`, the stronger border, and no shadow. It was `h-9
 * rounded-md border-edge shadow-sm`, which put a taller, rounder, shadowed
 * control next to a flat one.
 */
function trigger(className?: string) {
  render(
    <Select>
      <SelectTrigger aria-label="Pick" className={className}>
        <SelectValue placeholder="Pick" />
      </SelectTrigger>
    </Select>,
  );
  return screen.getByRole('combobox').className.split(/\s+/);
}

describe('SelectTrigger matches Input', () => {
  it('is 44px on touch and 32px from md, with the Input radius and border', () => {
    const classes = trigger();
    for (const cls of ['h-11', 'md:h-8', 'rounded-sm', 'border-edge-strong']) {
      expect(classes).toContain(cls);
    }
    for (const stale of ['h-9', 'rounded-md', 'border-edge']) {
      expect(classes).not.toContain(stale);
    }
  });

  it('is flat (no shadow)', () => {
    expect(trigger().join(' ')).not.toMatch(/\bshadow(-\w+)?\b/);
  });

  it('keeps its other classes (full width, text-sm, focus ring)', () => {
    const classes = trigger();
    for (const cls of ['w-full', 'text-sm', 'focus-visible:ring-2', 'focus-visible:ring-focus']) {
      expect(classes).toContain(cls);
    }
  });

  it('lets a caller narrow it without touching the height', () => {
    const classes = trigger('w-[70px]');
    expect(classes).toContain('w-[70px]');
    expect(classes).toContain('h-11');
    expect(classes).toContain('md:h-8');
  });
});
