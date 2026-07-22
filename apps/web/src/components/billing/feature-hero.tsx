/**
 * FeatureHero — visual hero block for upgrade-dialog and locked-feature-screen.
 *
 * Per-feature asset map is empty today; every feature falls through to the
 * gradient + Sparkles fallback. Add entries to ASSET_MAP when product art ships.
 */
import { Sparkles } from 'lucide-react';
import type { CommunityFeatures } from '@propertypro/shared';

export type FeatureHeroVariant = 'dialog' | 'screen';

export interface FeatureHeroProps {
  featureKey: keyof CommunityFeatures | null;
  variant: FeatureHeroVariant;
}

const ASSET_MAP: Partial<Record<keyof CommunityFeatures, { src: string; alt: string }>> = {};

export function FeatureHero({ featureKey, variant }: FeatureHeroProps) {
  const asset = featureKey ? ASSET_MAP[featureKey] : null;

  // Gradient stops reference primitives directly (packages/ui/src/styles/tokens.css)
  // rather than semantic tokens: this decorative hero gradient is intentionally
  // fixed-blue-to-violet regardless of community theming. #6366F1 (indigo-500)
  // has no primitive in this palette (no indigo family) — --violet-600 is used
  // for the middle stop so it stays visually distinct from the --violet-500 end
  // stop (the numerically-closest primitive, --violet-500 itself, would collapse
  // the last third of the gradient into a flat, non-blended color).
  const containerClass =
    variant === 'screen'
      ? 'relative flex h-56 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-[var(--blue-500)] via-[var(--violet-600)] to-[var(--violet-500)] sm:h-72'
      : 'relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--blue-500)] via-[var(--violet-600)] to-[var(--violet-500)]';

  if (asset) {
    return (
      <div className={containerClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.src}
          alt={asset.alt}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }

  const orbSizes = variant === 'screen' ? ['size-40', 'size-48'] : ['size-32', 'size-40'];
  const sparkleSize = variant === 'screen' ? 88 : 56;
  const sparkleStroke = variant === 'screen' ? 1.4 : 1.5;

  return (
    <div className={containerClass}>
      <div className="absolute inset-0 opacity-20" aria-hidden="true">
        <div className={`absolute -left-10 -top-10 ${orbSizes[0]} rounded-full bg-white blur-3xl`} />
        <div className={`absolute -right-12 bottom-0 ${orbSizes[1]} rounded-full bg-white blur-3xl`} />
      </div>
      <Sparkles
        size={sparkleSize}
        strokeWidth={sparkleStroke}
        className="relative text-white drop-shadow-md"
        aria-hidden="true"
      />
    </div>
  );
}

export default FeatureHero;
