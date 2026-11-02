import type { ReactNode } from 'react';

/**
 * The frame every titled section of the public site shares: the title in a
 * left column and the content beside it on wide screens, stacked on phones.
 *
 * One place sets the site's section rhythm and title size, so every look and
 * layout changes together and no section drifts from the others. A look still
 * colours the title (`SiteChrome` paints `h2` in the theme's primary).
 */
export function SiteSection({
  id,
  headingId,
  title,
  children,
}: {
  /** The section's anchor id, for quick links (`page-sections.ts`). */
  id?: string;
  /** The title's id, which names the section for assistive tech. */
  headingId?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={headingId} className="px-6 py-16 site-sm:px-8 site-md:py-24 site-lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-6 site-md:grid-cols-3 site-md:gap-12">
        <h2
          id={headingId}
          className="self-start font-heading text-3xl font-semibold leading-tight tracking-tight text-content site-md:text-4xl"
        >
          {title}
        </h2>
        <div className="min-w-0 site-md:col-span-2">{children}</div>
      </div>
    </section>
  );
}

/** What a section shows when it has nothing yet. Only the editor canvas draws it: the live site leaves an empty section out. */
export function SiteSectionEmpty({ children }: { children: ReactNode }) {
  return <p className="text-base text-content-secondary">{children}</p>;
}
