/**
 * The look chooser: Simple mode's Look row and Advanced's Design panel. Choosing
 * a card drafts the look; "Keep" takes a drafted one back off, which is the only
 * way back for a site on a legacy layout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

const { selectMock, keepMock, pending, designRef } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  keepMock: vi.fn(),
  pending: { select: false, keep: false },
  designRef: {
    current: { live: {}, draft: {} } as {
      live: Record<string, unknown>;
      draft: Record<string, unknown>;
    },
  },
}));

vi.mock('@/hooks/use-site-design', () => ({
  useSiteDesign: () => ({ data: designRef.current, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-site-look', () => ({
  useSelectLook: () => ({ mutate: selectMock, isPending: pending.select }),
  useKeepCurrentLook: () => ({ mutate: keepMock, isPending: pending.keep }),
}));
const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

import { LookChooser } from '@/components/pm/site-editor-v3/panels/LookChooser';

function radio(name: string) {
  return screen.getByRole('radio', { name: new RegExp(`^${name}`) });
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.select = false;
  pending.keep = false;
  designRef.current = { live: { layoutId: 'palm-grove' }, draft: {} };
});

describe('LookChooser', () => {
  it('marks the live look as chosen and live', () => {
    render(<LookChooser communityId={7} />);
    expect(radio('Palm Grove')).toBeChecked();
    expect(radio('Bayfront')).not.toBeChecked();
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Keep/ })).not.toBeInTheDocument();
  });

  it('drafts the look a manager picks, and says it waits for Publish', async () => {
    const user = userEvent.setup();
    render(<LookChooser communityId={7} />);
    await user.click(radio('Bayfront'));

    expect(selectMock).toHaveBeenCalledWith('bayfront', expect.anything());
    selectMock.mock.calls[0]![1].onSuccess();
    expect(toastSuccess).toHaveBeenCalledWith(
      'Bayfront is ready. Publish to put it on your website.',
    );
  });

  it('sends nothing when the chosen look is picked again', async () => {
    const user = userEvent.setup();
    render(<LookChooser communityId={7} />);
    await user.click(radio('Palm Grove'));
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('shows a drafted look as chosen, and offers to keep the live one', async () => {
    const user = userEvent.setup();
    designRef.current = { live: { layoutId: 'palm-grove' }, draft: { layoutId: 'heritage' } };
    render(<LookChooser communityId={7} />);

    expect(radio('Heritage')).toBeChecked();
    expect(screen.getByText("Heritage isn't published yet.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep Palm Grove' }));
    expect(keepMock).toHaveBeenCalledWith(undefined, expect.anything());
  });

  // The legacy case is why the keep stays: no card can return to these layouts.
  it('on a legacy layout, checks no card and still offers the way back', () => {
    designRef.current = { live: { layoutId: 'tidewater' }, draft: { layoutId: 'bayfront' } };
    render(<LookChooser communityId={7} />);
    expect(radio('Bayfront')).toBeChecked();
    expect(screen.queryByText('Live now')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep my current look' })).toBeInTheDocument();
  });

  // Revert check (production line): `busy ||` in `choose`.
  it('holds still while a look is being saved, without taking focus away', async () => {
    const user = userEvent.setup();
    pending.select = true;
    render(<LookChooser communityId={7} />);
    // Not disabled: a disabled radio would drop a keyboard user's focus.
    expect(radio('Bayfront')).toBeEnabled();
    expect(screen.getByRole('group', { name: 'Look' })).toHaveAttribute('aria-busy', 'true');
    await user.click(radio('Bayfront'));
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('has no axe violations with a drafted look and its way back', async () => {
    designRef.current = { live: { layoutId: 'palm-grove' }, draft: { layoutId: 'heritage' } };
    const { container } = render(<LookChooser communityId={7} />);
    // Rendered, all four cards and the keep button.
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Keep Palm Grove' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
