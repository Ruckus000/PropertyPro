import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import {
  ResourceDisclaimer,
  resourceMdxComponents,
} from '@/components/marketing/resource-mdx-components';
import { buildArticleJsonLd } from '@/lib/marketing/article-jsonld';
import {
  getAllResources,
  getResourceBySlug,
  getResourceSlugs,
} from '@/lib/services/resource-article-service';

const SITE_URL = 'https://getpropertypro.com';

interface ResourcePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return getResourceSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceBySlug(slug);
  if (!article) return {};

  const { metadata } = article;
  return {
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    alternates: { canonical: `/resources/${metadata.slug}` },
    openGraph: {
      type: 'article',
      title: metadata.title,
      description: metadata.description,
      url: `${SITE_URL}/resources/${metadata.slug}`,
      publishedTime: metadata.publishedAt,
      modifiedTime: metadata.updatedAt,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function ResourceArticlePage({ params }: ResourcePageProps) {
  const { slug } = await params;
  const article = getResourceBySlug(slug);
  if (!article) notFound();

  const { metadata, rawContent } = article;

  // compileMDX, not <MDXRemote/> — the client component hits a null hooks
  // dispatcher in the App Router render path. Same reasoning as the help route.
  const { content } = await compileMDX({
    source: rawContent,
    components: resourceMdxComponents,
    options: { parseFrontmatter: true },
  });

  const related = getAllResources()
    .filter((candidate) => candidate.slug !== metadata.slug)
    .slice(0, 3);

  return (
    <article className="mk-prose">
      <script
        type="application/ld+json"
        // Static, server-built object — no user input reaches this.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildArticleJsonLd(metadata, SITE_URL)),
        }}
      />

      <h1>{metadata.title}</h1>
      <p className="mk-res-byline">
        Updated {formatDate(metadata.updatedAt)} · {metadata.readTimeMinutes} min
        read
      </p>

      {/*
        Template-injected rather than authored in MDX so no article can ship
        without it. See .claude/rules/florida-compliance.md.
      */}
      <ResourceDisclaimer reviewedAt={formatDate(metadata.updatedAt)} />

      {content}

      <ResourceDisclaimer />

      {related.length > 0 ? (
        <>
          <h2 id="keep-reading">Keep reading</h2>
          <ul>
            {related.map((candidate) => (
              <li key={candidate.slug}>
                <Link href={`/resources/${candidate.slug}`}>{candidate.title}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
