import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicHome } from '../../src/components/public/public-home';
import { PublicNotices } from '../../src/components/public/public-notices';

describe('public website components', () => {
  it('renders community home with notices link for condo communities', () => {
    const html = renderToStaticMarkup(
      <PublicHome
        community={{
          id: 1,
          slug: 'sunset',
          name: 'Sunset Condos',
          communityType: 'condo_718',
          addressLine1: '123 Beach Ave',
          addressLine2: null,
          city: 'Miami',
          state: 'FL',
          zipCode: '33101',
        }}
      />,
    );

    expect(html).toContain('Sunset Condos');
    expect(html).toContain('Notices');
    expect(html).toContain('/auth/login');
  });

  it('renders notices list', () => {
    const html = renderToStaticMarkup(
      <PublicNotices
        communityName="Palm Shores HOA"
        notices={[
          {
            id: 1,
            title: 'Board Meeting',
            meetingType: 'board',
            startsAt: '2026-03-01T19:00:00.000Z',
            location: 'Clubhouse',
          },
        ]}
      />,
    );

    expect(html).toContain('Palm Shores HOA');
    expect(html).toContain('Board Meeting');
    expect(html).toContain('Clubhouse');
  });
});
