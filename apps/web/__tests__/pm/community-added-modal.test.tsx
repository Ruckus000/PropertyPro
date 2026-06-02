import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { replaceMock, getParams, setParams } = vi.hoisted(() => {
  let current = new URLSearchParams();
  return {
    replaceMock: vi.fn(),
    getParams: () => current,
    setParams: (p: URLSearchParams) => {
      current = p;
    },
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => getParams(),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/pm/dashboard/communities',
}));

import { CommunityAddedModal } from '@/components/pm/CommunityAddedModal';

describe('CommunityAddedModal', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    setParams(new URLSearchParams());
  });

  it('does not render when added_session_id is absent', () => {
    render(<CommunityAddedModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a success modal when added_session_id is present', () => {
    setParams(new URLSearchParams('added_session_id=cs_123'));
    render(<CommunityAddedModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/community added/i)).toBeInTheDocument();
  });

  it('strips added_session_id from the URL on close, preserving other params', () => {
    setParams(new URLSearchParams('added_session_id=cs_123&communityType=condo_718'));
    render(<CommunityAddedModal />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(replaceMock).toHaveBeenCalledWith('/pm/dashboard/communities?communityType=condo_718');
  });

  it('replaces with the bare pathname when no other params remain', () => {
    setParams(new URLSearchParams('added_session_id=cs_123'));
    render(<CommunityAddedModal />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(replaceMock).toHaveBeenCalledWith('/pm/dashboard/communities');
  });
});
