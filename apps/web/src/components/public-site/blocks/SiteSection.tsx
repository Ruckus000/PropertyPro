import type { ReactNode } from 'react';

/**
 * The frame every titled section of the public site shares, so the site keeps
 * one rhythm and one title size whichever look draws it. A look still colours
 * the title (`SiteChrome` paints `h2` in the theme's primary).
 *
 * Two compositions, chosen by the section for its content rather than offered
 * to anyone as a setting:
 * - `stacked`: the title, an optional line of introduction, then the content at
 *   full width. For content that wants the width (news, the board).
 * - `split`: the title and introduction in a narrow column beside the content.
 *   For lists read down a column (meetings, records, contact).
 */
export function SiteSection({
  id,
  headingId,
  title,
  intro,
  layout = 'split',
  children,
}: {
  /** The section's anchor id, for quick links (`page-sections.ts`). */
  id?: string;
  /** The title's id, which names the section for assistive tech. */
  headingId?: string;
  title: ReactNode;
  /** One plain sentence under the title, when the section needs explaining. */
  intro?: ReactNode;
  layout?: 'stacked' | 'split';
  children: ReactNode;
}) {
  const heading = (
    <div className="self-start">
      <h2
        id={headingId}
        className="font-heading text-3xl font-semibold leading-tight tracking-tight text-content site-md:text-4xl"
      >
        {title}
      </h2>
      {intro ? <p className="mt-3 max-w-prose text-lg leading-relaxed text-content-secondary">{intro}</p> : null}
    </div>
  );

  return (
    <section id={id} aria-labelledby={headingId} className="px-6 py-16 site-sm:px-8 site-md:py-24 site-lg:px-10">
      {layout === 'stacked' ? (
        <div className="mx-auto max-w-6xl">
          {heading}
          <div className="mt-10 min-w-0">{children}</div>
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-8 site-md:grid-cols-3 site-md:gap-12">
          {heading}
          <div className="min-w-0 site-md:col-span-2">{children}</div>
        </div>
      )}
    </section>
  );
}

/** What a section shows when it has nothing yet. Only the editor canvas draws it: the live site leaves an empty section out. */
export function SiteSectionEmpty({ children }: { children: ReactNode }) {
  return <p className="text-lg text-content-secondary">{children}</p>;
}
