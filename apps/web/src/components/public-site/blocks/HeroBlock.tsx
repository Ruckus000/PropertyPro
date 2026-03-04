import type { CommunityTheme } from '@propertypro/theme';
import type { HeroBlockContent } from '@propertypro/shared';

interface HeroBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Hero block — full-width section with background image overlay, heading,
 * subheading, and optional CTA button.
 */
export function HeroBlock({ content, theme }: HeroBlockProps) {
  const c = content as unknown as HeroBlockContent;
  const heading = c.heading || theme.communityName;
  const subheading = c.subheading;
  const backgroundImageUrl = c.backgroundImageUrl;
  const ctaText = c.ctaText;
  const ctaUrl = c.ctaUrl;

  return (
    <section
      className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 flex items-center justify-center text-center"
      style={{
        backgroundColor: theme.primaryColor,
        backgroundImage: backgroundImageUrl
          ? `url(${backgroundImageUrl})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay for readability when background image is present */}
      {backgroundImageUrl ? (
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      ) : null}
      <div className="relative z-10 max-w-3xl mx-auto">
        <h1
          className="text-4xl sm:text-5xl font-bold text-white mb-4"
          style={{ fontFamily: `'${theme.fontHeading}', sans-serif` }}
        >
          {heading}
        </h1>
        {subheading ? (
          <p
            className="text-lg sm:text-xl text-white/90 mb-8"
            style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
          >
            {subheading}
          </p>
        ) : null}
        {ctaText && ctaUrl ? (
          <a
            href={ctaUrl}
            className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md transition-colors"
            style={{
              backgroundColor: theme.accentColor,
              color: theme.primaryColor,
            }}
          >
            {ctaText}
          </a>
        ) : null}
      </div>
    </section>
  );
}
