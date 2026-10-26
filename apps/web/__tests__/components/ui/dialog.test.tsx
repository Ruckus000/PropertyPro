import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

describe('DialogContent edge resizing', () => {
  function openResizable() {
    mockMatchMedia(true);
    render(
      <Dialog open>
        <DialogContent resizable>
          <DialogTitle>Resizable</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      width: 500,
      height: 400,
    } as DOMRect);
    // jsdom has no pointer capture.
    dialog.querySelectorAll('div').forEach((el) => {
      el.setPointerCapture = vi.fn();
      el.hasPointerCapture = vi.fn(() => false);
    });
    return dialog;
  }

  function drag(handle: Element, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(handle, { clientX: from[0], clientY: from[1], pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: to[0], clientY: to[1], pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: to[0], clientY: to[1], pointerId: 1 });
  }

  it('offers a strip along the whole of every edge, not a grip in the middle', () => {
    const dialog = openResizable();
    const right = screen.getByLabelText('Resize dialog width');
    const bottom = screen.getByLabelText('Resize dialog height');
    const left = dialog.querySelector('[data-resize-edge="left"]')!;
    const top = dialog.querySelector('[data-resize-edge="top"]')!;
    for (const edge of [right, left]) {
      expect(edge.className).toMatch(/\binset-y-0\b/);
      expect(edge.className).toContain('cursor-ew-resize');
    }
    for (const edge of [bottom, top]) {
      expect(edge.className).toMatch(/\binset-x-0\b/);
      expect(edge.className).toContain('cursor-ns-resize');
    }
  });

  it('keeps every strip inside the border unless the dialog opts out of clipping', () => {
    // The default dialog scrolls (`overflow-y-auto`), so a strip poking past the
    // border adds scroll overflow and a stray scrollbar. Only a dialog that sets
    // `overflow-visible` lets the strips straddle the border.
    const dialog = openResizable();
    const edges = [
      screen.getByLabelText('Resize dialog width'),
      screen.getByLabelText('Resize dialog height'),
      ...dialog.querySelectorAll('[data-resize-edge]'),
    ];
    expect(edges).toHaveLength(4);
    for (const edge of edges) {
      for (const cls of edge.className.split(/\s+/)) {
        if (/^-(right|bottom|left|top)-/.test(cls)) {
          throw new Error(`unconditional outward offset: ${cls}`);
        }
      }
      expect(edge.className).toMatch(/\[\.overflow-visible>&\]:-(right|bottom|left|top)-1/);
      // A ring drawn outside would be clipped by that same overflow.
      expect(edge.className).toContain('focus-visible:ring-inset');
    }
  });

  it('keeps keyboard resizing on right, bottom and the corner only', () => {
    const dialog = openResizable();
    expect(dialog.querySelectorAll('[role="separator"][tabindex="0"]')).toHaveLength(3);
    for (const edge of dialog.querySelectorAll('[data-resize-edge]')) {
      expect(edge).toHaveAttribute('aria-hidden', 'true');
      expect(edge).not.toHaveAttribute('tabindex');
    }
  });

  it('widens the dialog when the right edge is dragged outward', () => {
    const dialog = openResizable();
    drag(screen.getByLabelText('Resize dialog width'), [700, 300], [750, 300]);
    expect(dialog.style.width).toBe('600px');
    expect(dialog.style.height).toBe('400px');
  });

  it('widens the dialog when the LEFT edge is dragged outward, which is leftward', () => {
    const dialog = openResizable();
    drag(dialog.querySelector('[data-resize-edge="left"]')!, [200, 300], [150, 300]);
    expect(dialog.style.width).toBe('600px');
  });

  it('grows the dialog when the TOP edge is dragged upward, and shrinks it dragged down', () => {
    const dialog = openResizable();
    const top = dialog.querySelector('[data-resize-edge="top"]')!;
    drag(top, [400, 100], [400, 70]);
    expect(dialog.style.height).toBe('460px');
    expect(dialog.style.width).toBe('500px');
    drag(top, [400, 100], [400, 130]);
    expect(dialog.style.height).toBe('340px');
  });
});
