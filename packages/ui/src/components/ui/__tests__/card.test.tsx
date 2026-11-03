// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardFooter, CardHeader } from '../card';

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

describe('Card', () => {
  it('uses the flat base classes', () => {
    const { container } = render(<Card />);
    expect(classesOf(container.firstElementChild as Element)).toEqual([
      'rounded-md',
      'border',
      'border-edge',
      'bg-surface-card',
      'text-content',
    ]);
  });

  it('has no shadow at rest', () => {
    const { container } = render(<Card />);
    const shadows = classesOf(container.firstElementChild as Element).filter((c) =>
      /(^|:)shadow/.test(c),
    );
    expect(shadows).toEqual([]);
  });

  it('CardHeader is a 16px-padded column with a 4px gap', () => {
    const { container } = render(<CardHeader />);
    expect(classesOf(container.firstElementChild as Element)).toEqual([
      'flex',
      'flex-col',
      'gap-1',
      'p-4',
    ]);
  });

  it('CardContent is 16px-padded with no top padding', () => {
    const { container } = render(<CardContent />);
    expect(classesOf(container.firstElementChild as Element)).toEqual(['p-4', 'pt-0']);
  });

  it('CardFooter is 16px-padded with no top padding', () => {
    const { container } = render(<CardFooter />);
    expect(classesOf(container.firstElementChild as Element)).toEqual([
      'flex',
      'items-center',
      'p-4',
      'pt-0',
    ]);
  });
});
