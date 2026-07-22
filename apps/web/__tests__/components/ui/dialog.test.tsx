import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  computeResize,
} from '@/components/ui/dialog';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  cleanup();
  vi.restoreAllMocks();
});

describe('computeResize', () => {
  const base = {
    startWidth: 500,
    startHeight: 400,
    minWidth: 360,
    minHeight: 240,
    maxWidth: 1200,
    maxHeight: 900,
  };

  it('grows width by 2*dx (center-anchored) for the x axis', () => {
    expect(computeResize({ ...base, dx: 50, dy: 0, axis: 'x' })).toEqual({
      width: 600,
      height: 400,
    });
  });

  it('grows height by 2*dy for the y axis and leaves width alone', () => {
    expect(computeResize({ ...base, dx: 999, dy: 30, axis: 'y' })).toEqual({
      width: 500,
      height: 460,
    });
  });

  it('adjusts both dimensions for the corner', () => {
    expect(computeResize({ ...base, dx: 10, dy: 20, axis: 'both' })).toEqual({
      width: 520,
      height: 440,
    });
  });

  it('clamps to the minimums', () => {
    expect(computeResize({ ...base, dx: -1000, dy: -1000, axis: 'both' })).toEqual({
      width: 360,
      height: 240,
    });
  });

  it('clamps to the maximums (viewport cap)', () => {
    expect(computeResize({ ...base, dx: 1000, dy: 1000, axis: 'both' })).toEqual({
      width: 1200,
      height: 900,
    });
  });
});

describe('DialogContent rendering', () => {
  it('applies the size variant width class', () => {
    mockMatchMedia(false);
    render(
      <Dialog open>
        <DialogContent size="xl">
          <DialogTitle>Wide</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole('dialog').className).toContain('sm:max-w-[960px]');
  });

  it('renders resize handles when resizable on desktop', () => {
    mockMatchMedia(true);
    render(
      <Dialog open>
        <DialogContent resizable>
          <DialogTitle>Resizable</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByLabelText('Resize dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Resize dialog width')).toBeInTheDocument();
    expect(screen.getByLabelText('Resize dialog height')).toBeInTheDocument();
  });

  it('renders no resize handles on mobile even when resizable', () => {
    mockMatchMedia(false);
    render(
      <Dialog open>
        <DialogContent resizable>
          <DialogTitle>Resizable</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByLabelText('Resize dialog')).not.toBeInTheDocument();
  });

  it('renders no resize handles when not resizable', () => {
    mockMatchMedia(true);
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Static</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByLabelText('Resize dialog')).not.toBeInTheDocument();
  });
});
