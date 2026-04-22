import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OwnerCards,
  BoardMemberCards,
  TenantCards,
} from '../../../src/components/onboarding/welcome-snapshot-cards';

const CID = 42;
const community = {
  name: 'Sunset Condos', slug: 'sunset-condos',
  city: 'Miami', state: 'FL', communityType: 'condo_718' as const,
};
const compliance = { score: 85, totalItems: 10, satisfiedItems: 8 };

describe('WelcomeSnapshotCards — community-scoped hrefs', () => {
  it('OwnerCards compliance link is community-scoped', () => {
    render(
      <OwnerCards
        communityId={CID}
        community={community}
        announcement={null}
        compliance={compliance}
      />,
    );
    expect(screen.getByRole('link', { name: /view compliance/i }))
      .toHaveAttribute('href', `/communities/${CID}/compliance`);
  });

  it('BoardMemberCards compliance + dashboard links include communityId', () => {
    render(
      <BoardMemberCards
        communityId={CID}
        community={community}
        compliance={compliance}
        recentActivity="None"
      />,
    );
    expect(screen.getByRole('link', { name: /review compliance/i }))
      .toHaveAttribute('href', `/communities/${CID}/compliance`);
    expect(screen.getByRole('link', { name: /go to dashboard/i }))
      .toHaveAttribute('href', `/dashboard?communityId=${CID}`);
  });

  it('TenantCards documents link is community-scoped', () => {
    render(
      <TenantCards
        communityId={CID}
        community={community}
        unit={null}
      />,
    );
    expect(screen.getByRole('link', { name: /browse documents/i }))
      .toHaveAttribute('href', `/communities/${CID}/documents`);
  });
});
