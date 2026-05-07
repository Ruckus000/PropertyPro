import Link from 'next/link';
import { HelpSearchInput } from './help-search-input';
import type { HelpTaskCard } from '@/lib/help/task-cards';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

interface HelpContactInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface HelpHubContentProps {
  communityId: number;
  isAdmin: boolean;
  taskCards: HelpTaskCard[];
  featuredArticles: HelpArticleMetadata[];
  contact: HelpContactInfo;
}

function articleHref(article: HelpArticleMetadata, communityId: number) {
  return `/help/${article.category}/${article.slug}?communityId=${communityId}`;
}

export function HelpHubContent({
  communityId,
  isAdmin,
  taskCards,
  featuredArticles,
  contact,
}: HelpHubContentProps) {
  const hasAnyContact = !!(contact.name || contact.email || contact.phone);

  return (
    <div className="space-y-8">
      <HelpSearchInput communityId={communityId} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-content">Common tasks</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Start with the actions people use most often.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {taskCards.map((card) => (
            <Link
              key={card.id}
              href={card.href}
              className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
            >
              <h3 className="text-base font-semibold text-content">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-content">Featured guides</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Platform guidance tailored to your role.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {featuredArticles.map((article) => (
            <Link
              key={article.slug}
              href={articleHref(article, communityId)}
              className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                {article.category.replace(/-/g, ' ')}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-content">{article.title}</h3>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {article.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {isAdmin && (
        <div className="flex justify-end">
          <Link
            href={`/help/manage?communityId=${communityId}`}
            className="inline-flex items-center justify-center rounded-xl border border-edge px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
          >
            Manage community FAQs
          </Link>
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-content">Management contact</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Reach the people supporting your community.
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm">
          {hasAnyContact ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Contact name
                </p>
                <p className="mt-2 text-sm text-content">{contact.name ?? 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Email
                </p>
                <p className="mt-2 text-sm text-content">{contact.email ?? 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Phone
                </p>
                <p className="mt-2 text-sm text-content">{contact.phone ?? 'Not provided'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">
              Contact information has not been added for this community yet.
            </p>
          )}
          <div className="mt-4">
            <Link
              href={`/help/contact?communityId=${communityId}`}
              className="inline-flex items-center justify-center rounded-xl border border-edge px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
            >
              Open contact details
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
