import { notFound } from 'next/navigation';
import Link from 'next/link';
import { compileMDX } from 'next-mdx-remote/rsc';
import { ChevronRight } from 'lucide-react';
import { getArticleBySlug, getAllArticles } from '@/lib/services/help-article-service';
import { helpMdxComponents } from '@/components/help/mdx-components';

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

export default async function HelpArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const { metadata, rawContent } = article;

  const { content } = await compileMDX({
    source: rawContent,
    components: helpMdxComponents,
  });

  // Build related articles list from frontmatter
  const allArticles = getAllArticles();
  const relatedArticles = metadata.relatedArticles
    .map((relSlug) => allArticles.find((a) => a.slug === relSlug))
    .filter((article): article is NonNullable<typeof article> => !!article);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">
          Help
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link
          href={`/help/${metadata.category}`}
          className="capitalize hover:text-content-secondary transition-colors"
        >
          {metadata.category.replace(/-/g, ' ')}
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">{metadata.title}</span>
      </nav>

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-content lg:text-3xl">
          {metadata.title}
        </h1>
        <p className="mt-2 text-base text-content-secondary">
          {metadata.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-content-tertiary">
          <span>{metadata.readTimeMinutes} min read</span>
          {metadata.roles.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <div className="flex gap-1.5">
                {metadata.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-surface-muted px-2 py-0.5 text-content-tertiary capitalize"
                  >
                    {role.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* MDX content */}
      <article className="prose prose-stone max-w-none [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:text-xl [&>h2]:font-semibold [&>h3]:mt-6 [&>h3]:mb-3 [&>h3]:text-lg [&>h3]:font-medium [&>p]:my-4 [&>p]:leading-relaxed [&>p]:text-content-secondary [&>ul]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:text-content-secondary [&>ol]:my-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2 [&>ol]:text-content-secondary [&>table]:my-6 [&>table]:w-full [&>table]:text-sm [&_th]:border [&_th]:border-edge [&_th]:bg-surface-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-edge [&_td]:px-3 [&_td]:py-2">
        {content}
      </article>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <aside className="mt-12 border-t border-edge pt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
            Related Articles
          </h2>
          <div className="space-y-3">
            {relatedArticles.map((related) => (
              <Link
                key={related.slug}
                href={`/help/${related.category}/${related.slug}`}
                className="block rounded-[var(--radius-md)] border border-edge p-4 transition-colors hover:bg-surface-muted"
              >
                <p className="text-sm font-medium text-content">
                  {related.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary">
                  {related.description}
                </p>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
