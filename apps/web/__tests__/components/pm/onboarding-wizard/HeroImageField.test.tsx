import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import React from 'react';

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="crop">{children}</div>,
}));
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}));

// Stub the crop-scaling helper so we don't pull ReactCrop math (jsdom gives
// the preview <img> zero natural dims anyway → cropBox is omitted).
vi.mock('@/lib/site-assets/scale-crop', () => ({
  scaleCropToNatural: () => null,
}));

const uploadMock = vi.fn();
const updateHeroMock = vi.fn();
const heroData = { current: null as unknown };

vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock('@/hooks/use-hero-block', () => ({
  useHeroBlock: () => ({ data: heroData.current }),
  useUpdateHeroBlock: () => ({ mutateAsync: updateHeroMock, isPending: false }),
}));

import { HeroImageField } from '@/components/pm/onboarding-wizard/HeroImageField';

function wrap(node: ReactNode) {
  return <>{node}</>;
}

const validDims = { width: 1920, height: 1080 };
const okDims = vi.fn(async () => validDims);

beforeEach(() => {
  vi.clearAllMocks();
  heroData.current = null;
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  // finalize echoes back the altText it was sent — mirror that so the merged
  // hero content reflects what the PM actually typed.
  uploadMock.mockImplementation(async ({ altText }: { altText: string }) => ({
    storagePath: '42/hero/abc-pool.jpg',
    variant1600Path: '42/hero/abc-pool.jpg.1600w.webp',
    variant800Path: '42/hero/abc-pool.jpg.800w.webp',
    altText,
  }));
  updateHeroMock.mockResolvedValue(undefined);
});

function makeFile(name: string, type: string, size = 2048): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('<HeroImageField>', () => {
  it('rejects a non-image MIME type and shows no crop/alt UI', async () => {
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={okDims} />));
    // fireEvent (not userEvent.upload) so the file bypasses the input's
    // `accept` filter and exercises the component's defensive MIME check.
    fireEvent.change(screen.getByTestId('wizard-hero-image-input'), {
      target: { files: [makeFile('x.gif', 'image/gif')] },
    });
    expect(await screen.findByTestId('hero-image-file-error')).toHaveTextContent(/JPEG, PNG, or WebP/i);
    expect(screen.queryByTestId('wizard-hero-alt-input')).not.toBeInTheDocument();
    expect(okDims).not.toHaveBeenCalled();
  });

  it('rejects an image below the minimum dimensions with actual vs required', async () => {
    const smallDims = vi.fn(async () => ({ width: 800, height: 450 }));
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={smallDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('small.jpg', 'image/jpeg'));
    expect(await screen.findByTestId('hero-image-file-error')).toHaveTextContent(
      'Your image is 800×450, we need at least 1600×900.',
    );
    expect(screen.queryByTestId('wizard-hero-alt-input')).not.toBeInTheDocument();
  });

  it('shows the alt input for a valid image and gates Save on alt text', async () => {
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={okDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('hero.jpg', 'image/jpeg'));
    const alt = await screen.findByTestId('wizard-hero-alt-input');
    expect(screen.getByTestId('hero-image-save')).toBeDisabled();
    await userEvent.type(alt, 'Pool deck at sunset');
    expect(screen.getByTestId('hero-image-save')).toBeEnabled();
  });

  it('uploads as kind=hero and merges variant1600Path + alt into existing hero content', async () => {
    heroData.current = { headline: 'Existing headline', subtitle: 'A nice place' };
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={okDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('hero.jpg', 'image/jpeg'));
    await userEvent.type(await screen.findByTestId('wizard-hero-alt-input'), 'Pool deck at sunset');
    fireEvent.click(screen.getByTestId('hero-image-save'));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'hero', altText: 'Pool deck at sunset' }),
    );
    await waitFor(() => expect(updateHeroMock).toHaveBeenCalledTimes(1));
    expect(updateHeroMock).toHaveBeenCalledWith({
      headline: 'Existing headline',
      subtitle: 'A nice place',
      heroImagePath: '42/hero/abc-pool.jpg.1600w.webp',
      heroImageAlt: 'Pool deck at sunset',
    });
    expect(await screen.findByTestId('hero-image-outcome')).toHaveTextContent(/saved/i);
  });

  it('falls back to the provided headline when no hero content exists yet', async () => {
    heroData.current = null;
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome to Sunset Condos" readDimensions={okDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('hero.jpg', 'image/jpeg'));
    await userEvent.type(await screen.findByTestId('wizard-hero-alt-input'), 'Lobby');
    fireEvent.click(screen.getByTestId('hero-image-save'));

    await waitFor(() => expect(updateHeroMock).toHaveBeenCalledTimes(1));
    expect(updateHeroMock).toHaveBeenCalledWith(
      expect.objectContaining({ headline: 'Welcome to Sunset Condos', heroImageAlt: 'Lobby' }),
    );
  });

  it('surfaces a server error when the upload fails', async () => {
    uploadMock.mockRejectedValueOnce(new Error('Quota exceeded'));
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={okDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('hero.jpg', 'image/jpeg'));
    await userEvent.type(await screen.findByTestId('wizard-hero-alt-input'), 'Pool');
    fireEvent.click(screen.getByTestId('hero-image-save'));

    expect(await screen.findByTestId('hero-image-server-error')).toHaveTextContent('Quota exceeded');
    expect(updateHeroMock).not.toHaveBeenCalled();
  });

  it('writes into photos[0] when the hero already uses a photo array', async () => {
    // REGRESSION. This spread `base` and then set `heroImagePath`, so on a
    // hero that already had `photos` it produced content carrying BOTH imagery
    // shapes — which heroBlockSchema refuses. The PM got a 400 with
    // developer-facing copy in a wizard that has no photo UI to resolve it,
    // AFTER the upload had been finalized and charged against their quota.
    heroData.current = {
      headline: 'Existing headline',
      photos: [
        { path: '42/hero/old.jpg', alt: 'Old' },
        { path: '42/hero/gym.jpg', decorative: true },
      ],
    };
    render(wrap(<HeroImageField communityId={42} fallbackHeadline="Welcome" readDimensions={okDims} />));
    await userEvent.upload(screen.getByTestId('wizard-hero-image-input'), makeFile('hero.jpg', 'image/jpeg'));
    await userEvent.type(await screen.findByTestId('wizard-hero-alt-input'), 'Pool deck');
    fireEvent.click(screen.getByTestId('hero-image-save'));

    await waitFor(() => expect(updateHeroMock).toHaveBeenCalledTimes(1));
    const sent = updateHeroMock.mock.calls[0]![0];

    // Slot 0 replaced, the rest of the gallery untouched...
    expect(sent.photos).toEqual([
      { path: '42/hero/abc-pool.jpg', alt: 'Pool deck' },
      { path: '42/hero/gym.jpg', decorative: true },
    ]);
    // ...the BASE path stored, not the 1600w variant...
    expect(sent.photos[0].path).not.toContain('1600w');
    // ...and never both shapes.
    expect(sent).not.toHaveProperty('heroImagePath');
    expect(sent).not.toHaveProperty('heroImageAlt');
    expect(await screen.findByTestId('hero-image-outcome')).toHaveTextContent(/saved/i);
  });
});
