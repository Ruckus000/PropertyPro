/// <reference types="@testing-library/jest-dom" />
/**
 * PR-5: the resident's own unit reaches SubmitForm on both entry points —
 * the Operations sheet (`RequestCreateSheet`) and the mobile page
 * (`MobileSubmitRequestContent`). The OperationsHub → RequestCreateSheet hop
 * is pinned in `components/operations/operations-hub.test.tsx`.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/maintenance-requests', () => ({
  createMaintenanceRequest: vi.fn(),
  requestPhotoUploadUrl: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/mobile/maintenance/new',
}));

import { RequestCreateSheet } from '@/components/operations/RequestCreateSheet';
import { MobileSubmitRequestContent } from '@/components/mobile/MobileSubmitRequestContent';

function unitField() {
  return screen.getByLabelText(/^Apartment\/Unit Number/);
}

describe('unit default threading', () => {
  it('RequestCreateSheet opens the form on the given unit', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RequestCreateSheet
          open
          onClose={() => {}}
          communityId={1}
          userId="u-1"
          defaultUnitId={7}
          defaultUnitLabel="Unit 4B"
        />
      </QueryClientProvider>,
    );
    expect(unitField()).toHaveValue('Unit 4B');
  });

  it('MobileSubmitRequestContent opens the form on the given unit', () => {
    render(
      <MobileSubmitRequestContent
        communityId={1}
        userId="u-1"
        defaultUnitId={7}
        defaultUnitLabel="Unit 4B"
      />,
    );
    expect(unitField()).toHaveValue('Unit 4B');
  });
});
