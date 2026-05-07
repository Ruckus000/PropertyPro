import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpHubContent } from '../../src/components/help/help-hub-content';

describe('HelpHubContent', () => {
  it('renders task cards, featured articles, and management contact, with admin Manage CTA', () => {
    render(
      <HelpHubContent
        communityId={42}
        isAdmin={true}
        taskCards={[
          {
            id: 'documents',
            title: 'View Documents',
            description: 'Find records fast.',
            href: '/communities/42/documents',
          },
        ]}
        featuredArticles={[
          {
            title: 'Welcome to PropertyPro',
            description: 'Get oriented quickly.',
            category: 'getting-started',
            slug: 'welcome-to-propertypro',
            roles: ['tenant'],
            keywords: ['welcome'],
            tags: [],
            relatedArticles: [],
            featured: true,
            excerpt: 'Get oriented quickly.',
            filePath: '/tmp/help.mdx',
            contentHash: 'deadbeefdeadbeef',
          },
        ]}
        contact={{
          name: 'Alex Manager',
          email: 'manager@example.com',
          phone: '555-0100',
        }}
      />,
    );

    const commonTasksHeading = screen.getByRole('heading', { name: 'Common tasks' });
    const featuredHeading = screen.getByRole('heading', { name: 'Featured guides' });
    const contactHeading = screen.getByRole('heading', { name: 'Management contact' });

    // Common tasks → Featured guides → Management contact ordering.
    expect(
      commonTasksHeading.compareDocumentPosition(featuredHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      featuredHeading.compareDocumentPosition(contactHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // FAQ section is no longer on the hub (WS3 — removed duplication).
    expect(screen.queryByRole('heading', { name: 'Community FAQs' })).not.toBeInTheDocument();

    // Admin still gets the FAQ management entrypoint.
    expect(
      screen.getByRole('link', { name: 'Manage community FAQs' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex Manager')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Documents/ })).toBeInTheDocument();
  });

  it('hides the admin manage CTA for non-admin users', () => {
    render(
      <HelpHubContent
        communityId={42}
        isAdmin={false}
        taskCards={[]}
        featuredArticles={[]}
        contact={{ name: null, email: null, phone: null }}
      />,
    );

    expect(
      screen.queryByRole('link', { name: 'Manage community FAQs' }),
    ).not.toBeInTheDocument();
  });
});
