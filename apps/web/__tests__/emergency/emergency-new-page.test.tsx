import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';

const { composerProps } = vi.hoisted(() => ({ composerProps: vi.fn() }));
vi.mock('@/components/emergency/BroadcastComposer', () => ({
  BroadcastComposer: (props: unknown) => {
    composerProps(props);
    return <form aria-label="Composer stub" />;
  },
}));

import { EmergencyNewPage } from '@/components/emergency/emergency-new-page';

function view() {
  return render(
    <EmergencyNewPage
      communityId={7}
      communityName="Sunset Condos"
      communityType="condo_718"
      smsEnabled={true}
    />,
  );
}

describe('EmergencyNewPage', () => {
  it('passes the composer the same four props the page passes today', () => {
    view();
    expect(composerProps).toHaveBeenCalledWith({
      communityId: 7,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
      smsEnabled: true,
    });
  });

  it('titles the page and describes it', () => {
    view();
    expect(screen.getByRole('heading', { level: 1, name: 'New alert' })).toBeVisible();
    expect(
      screen.getByText('Write the alert, choose who gets it, and review it before sending.'),
    ).toBeVisible();
  });

  it('header holds a Cancel link back to the list and no button', () => {
    const { container } = view();
    const header = container.querySelector('[data-page-header]') as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/emergency?communityId=7',
    );
    expect(within(header).queryByRole('button', { name: /^(?!.*help).*$/i })).toBeNull();
  });

  it('draws no panel', () => {
    const { container } = view();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = view();
    expect(await axe(container)).toHaveNoViolations();
  });
});
