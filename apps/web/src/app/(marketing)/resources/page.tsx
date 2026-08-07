import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllResources } from '@/lib/services/resource-article-service';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Guides to Florida condo and HOA website compliance — what §718.111(12)(g) and §720.303 require, and by when.',
  alternates: { canonical: '/resources' },
};

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ResourcesIndexPage() {
  const articles = getAllResources();

  return (
    <>
      <div className="mk-sec-head">
        <span className="mk-eyebrow">Resources</span>
        <h1 className="mk-display">Florida compliance, in plain English.</h1>
        <p className="mk-muted">
          What the statutes actually require of condominium and homeowners&apos;
          associations — the deadlines, the documents, and the parts that trip
          boards up.
        </p>
      </div>

      {articles.length === 0 ? (
        <p className="mk-muted">New guides are on the way. Check back shortly.</p>
      ) : (
        <div className="mk-res-list">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/resources/${article.slug}`}
              className="mk-card mk-res-card"
            >
              <h2>{article.title}</h2>
              <p className="mk-muted">{article.description}</p>
              <div className="mk-res-meta">
                <span>{formatDate(article.updatedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>{article.readTimeMinutes} min read</span>
                {article.statutes.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{article.statutes.join(', ')}</span>
                  </>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
