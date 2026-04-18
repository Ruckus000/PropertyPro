import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpHubContent } from '../../src/components/help/help-hub-content';

describe('HelpHubContent', () => {
  it('renders task cards ahead of FAQs, shows contact info, and includes admin manage CTA', () => {
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
            relatedArticles: [],
            featured: true,
            excerpt: 'Get oriented quickly.',
            filePath: '/tmp/help.mdx',
          },
        ]}
        faqs={[
          {
            id: 7,
            question: 'How do I view documents?',
            answer: 'Open Documents.',
            sortOrder: 0,
            category: 'documents',
            roleVisibility: null,
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
    const faqHeading = screen.getByRole('heading', { name: 'Community FAQs' });

    expect(
      commonTasksHeading.compareDocumentPosition(faqHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage FAQs' })).toBeInTheDocument();
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
        faqs={[]}
        contact={{ name: null, email: null, phone: null }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Manage FAQs' })).not.toBeInTheDocument();
  });
});
