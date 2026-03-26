import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DemoListClient } from '@/components/demo/DemoListClient';

describe('demo list client', () => {
  it('renders initial demos without waiting for a mount-time fetch', () => {
    const html = renderToStaticMarkup(
      createElement(DemoListClient, {
        initialDemos: [
          {
            id: 7,
            template_type: 'hoa_720',
            prospect_name: 'Harbor Point HOA',
            slug: 'demo-harbor-point',
            theme: {},
            seeded_community_id: 11,
            demo_resident_user_id: 'resident-1',
            demo_board_user_id: 'board-1',
            demo_resident_email: 'resident@example.com',
            demo_board_email: 'board@example.com',
            auth_token_secret: 'secret',
            external_crm_url: 'https://example.com/crm',
            prospect_notes: 'Interested in onboarding next quarter',
            created_at: '2026-03-20T00:00:00.000Z',
            customized_at: null,
            is_converted: false,
          },
        ],
      }),
    );

    expect(html).toContain('Harbor Point HOA');
    expect(html).toContain('1 demo created');
    expect(html).toContain('href="/demo/7/preview"');
    expect(html).not.toContain('animate-spin');
  });
});
