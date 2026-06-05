import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  usePortfolioTemplatesMock,
  useCreateTemplateMock,
  useRenameTemplateMock,
  useDeleteTemplateMock,
  useApplyTemplateMock,
} = vi.hoisted(() => ({
  usePortfolioTemplatesMock: vi.fn(),
  useCreateTemplateMock: vi.fn(),
  useRenameTemplateMock: vi.fn(),
  useDeleteTemplateMock: vi.fn(),
  useApplyTemplateMock: vi.fn(),
}));

vi.mock('@/hooks/use-portfolio-templates', () => ({
  usePortfolioTemplates: usePortfolioTemplatesMock,
  useCreateTemplate: useCreateTemplateMock,
  useRenameTemplate: useRenameTemplateMock,
  useDeleteTemplate: useDeleteTemplateMock,
  useApplyTemplate: useApplyTemplateMock,
}));

import { PortfolioTemplatesManager } from '@/components/pm/portfolio/PortfolioTemplatesManager';

const COMMUNITIES = [
  { communityId: 1, name: 'Sunset Condos' },
  { communityId: 2, name: 'Palm Shores' },
];

const TEMPLATE = {
  id: 11,
  name: 'Coastal',
  siteLogoPath: 'portfolio-templates/11/site-logo.webp',
  createdAt: '2026-02-03T00:00:00.000Z',
  updatedAt: '2026-02-03T00:00:00.000Z',
  branding: { primaryColor: '#111' },
};

function mutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  usePortfolioTemplatesMock.mockReturnValue({ data: [TEMPLATE], isLoading: false, isError: false });
  useCreateTemplateMock.mockReturnValue(mutation());
  useRenameTemplateMock.mockReturnValue(mutation());
  useDeleteTemplateMock.mockReturnValue(mutation());
  useApplyTemplateMock.mockReturnValue(mutation());
});

describe('PortfolioTemplatesManager', () => {
  it('renders the upsell when access is gated', () => {
    render(<PortfolioTemplatesManager hasAccess={false} communities={COMMUNITIES} />);
    expect(screen.getByTestId('portfolio-upsell')).toBeInTheDocument();
    expect(screen.queryByTestId('templates-list')).not.toBeInTheDocument();
  });

  it('shows a loading skeleton', () => {
    usePortfolioTemplatesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<PortfolioTemplatesManager hasAccess communities={COMMUNITIES} />);
    expect(screen.queryByTestId('templates-list')).not.toBeInTheDocument();
  });

  it('shows the empty state', () => {
    usePortfolioTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PortfolioTemplatesManager hasAccess communities={COMMUNITIES} />);
    expect(screen.getByTestId('templates-empty')).toBeInTheDocument();
  });

  it('lists templates and disables Save until a name is entered', () => {
    const create = mutation();
    useCreateTemplateMock.mockReturnValue(create);
    render(<PortfolioTemplatesManager hasAccess communities={COMMUNITIES} />);

    expect(screen.getByTestId('templates-list')).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /save as template/i });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId('create-name'), { target: { value: 'Coastal' } });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(create.mutate).toHaveBeenCalledWith(
      { communityId: 1, name: 'Coastal' },
      expect.anything(),
    );
  });

  it('runs the apply flow: open panel → select → confirm → apply', () => {
    const apply = mutation();
    useApplyTemplateMock.mockReturnValue(apply);
    render(<PortfolioTemplatesManager hasAccess communities={COMMUNITIES} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('apply-panel')).toBeInTheDocument();

    // select both communities (checkboxes)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    fireEvent.click(screen.getByRole('button', { name: /apply to 2 communities/i }));
    // confirm step
    fireEvent.click(screen.getByRole('button', { name: /confirm — replace branding/i }));

    expect(apply.mutate).toHaveBeenCalledWith(
      { id: 11, communityIds: [1, 2] },
      expect.anything(),
    );
  });

  it('deletes a template', () => {
    const del = mutation();
    useDeleteTemplateMock.mockReturnValue(del);
    render(<PortfolioTemplatesManager hasAccess communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(del.mutate).toHaveBeenCalledWith(11);
  });
});
