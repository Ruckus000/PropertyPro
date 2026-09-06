import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpSearchResults } from '../../src/components/help/help-search-results';

describe('HelpSearchResults', () => {
  it('groups guide and FAQ results separately', () => {
    render(
      <HelpSearchResults
        communityId={42}
        query="maintenance"
        articleResults={[
          {
            title: 'Submitting a maintenance request',
            description: 'Report an issue and track updates.',
            category: 'maintenance',
            slug: 'submitting-a-maintenance-request',
            roles: ['tenant'],
            keywords: ['maintenance'],
            // Required by HelpArticleMetadata; neither is read by this
            // component, so the empty values reproduce the absent ones.
            tags: [],
            contentHash: '',
            relatedArticles: [],
            featured: true,
            excerpt: 'Report an issue.',
            filePath: '/tmp/help.mdx',
          },
        ]}
        faqResults={[
          {
            id: 1,
            question: 'How do I submit a maintenance request?',
            answer: 'Open Maintenance.',
            sortOrder: 0,
            category: 'maintenance',
            roleVisibility: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Platform Guides' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Community FAQs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Submitting a maintenance request/ })).toBeInTheDocument();
    expect(screen.getByText('How do I submit a maintenance request?')).toBeInTheDocument();
  });

  it('renders the empty state when there are no matches', () => {
    render(
      <HelpSearchResults
        communityId={42}
        query="nope"
        articleResults={[]}
        faqResults={[]}
      />,
    );

    expect(screen.getByText(/No help results matched/)).toBeInTheDocument();
  });
});
