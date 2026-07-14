import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button loading', () => {
  it('disables the button and shows a spinner when loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('data-loading')).toBe('true');
    expect(btn.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('renders children and no spinner when not loading', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn.querySelector('svg.animate-spin')).toBeNull();
  });
});
