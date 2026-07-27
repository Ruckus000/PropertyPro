/**
 * The remaining Phase 9 inspector forms: layout variant (text/image/amenities)
 * and empty-state copy (announcements/documents/meetings).
 *
 * `TextForm.test.tsx` covers the shared autosave/reconciliation machinery, so
 * this file sticks to what each form adds: keyboard operation, the schema
 * rules each one mirrors, and the round-trip hazards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageForm } from '@/components/pm/site-editor-v3/inspector/forms/ImageForm';
import { AmenitiesForm } from '@/components/pm/site-editor-v3/inspector/forms/AmenitiesForm';
import { SorEmptyTextForm } from '@/components/pm/site-editor-v3/inspector/forms/SorEmptyTextForm';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

const DEBOUNCE_MS = 800;

async function settleAutosave() {
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    await Promise.resolve();
  });
}

function setupTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VariantField — keyboard operation', () => {
  it('is a radio group that arrow keys move through', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    const group = screen.getByRole('group', { name: 'Width' });
    expect(group).toBeInTheDocument();
    // Absent variant normalises to standard, so the group is never
    // indeterminate.
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();

    // Focus the checked radio, then arrow. Roving focus within a radio group
    // is the platform behaviour a Radix Select would have had to reimplement.
    screen.getByRole('radio', { name: 'Standard' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Wide' })).toBeChecked();
    await settleAutosave();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ variant: 'wide' }) }),
    );
  });

  it('omits the variant entirely when it is standard', async () => {
    // Writing `variant: 'standard'` would make two identical-looking sections
    // differ by content key and show as a spurious entry in the publish diff.
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo', variant: 'wide' }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Standard' }));
    await settleAutosave();

    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).not.toHaveProperty('variant');
  });
});

describe('ImageForm — the alt/decorative rule', () => {
  it('blocks saving while a non-decorative image has no alt text', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    await user.clear(screen.getByLabelText(/Alt text/));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/mark it decorative/i)).toBeInTheDocument();
  });

  it('clears alt text when marked decorative, because the schema forbids both', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    await user.click(screen.getByLabelText(/This image is decorative/));
    expect(screen.getByLabelText(/Alt text/)).toHaveValue('');
    expect(screen.getByLabelText(/Alt text/)).toBeDisabled();

    await settleAutosave();
    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).toEqual({ imagePath: '1/content/a.jpg', decorative: true });
    expect(sent).not.toHaveProperty('altText');
  });
});

describe('AmenitiesForm', () => {
  it('drops blank rows rather than sending an amenity with an empty name', async () => {
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add amenity' }));
    await settleAutosave();

    // The new blank row must not reach the wire — `name` is min(1).
    const sent = upsertMock.mock.calls.at(-1)?.[0]?.content as
      | Record<string, unknown>
      | undefined;
    if (sent) expect(sent.items).toEqual([{ name: 'Pool' }]);
  });

  it('blocks saving when every row is blank', async () => {
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }] }}
      />,
    );

    await user.clear(screen.getByLabelText('Name'));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Name at least one amenity/i)).toBeInTheDocument();
  });

  it('labels each remove button by position', () => {
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }, { name: 'Gym' }] }}
      />,
    );
    // "Remove" repeated down a list is useless in a screen reader's element
    // list.
    expect(screen.getByRole('button', { name: 'Remove amenity 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove amenity 2' })).toBeInTheDocument();
  });
});

describe('SorEmptyTextForm', () => {
  it('writes the override and keeps the rest of the block config intact', async () => {
    // The hazard: a save writes the WHOLE content object. If the untouched
    // fields were dropped, editing the empty-state copy would silently reset
    // a PM's configured limit and window to the schema defaults.
    const user = setupTimers();
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="announcements"
        blockOrder={6}
        content={{ limit: 12, timeWindowDays: 90 }}
      />,
    );

    await user.type(screen.getByLabelText('Empty-state message'), 'Check back soon.');
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'announcements',
      blockOrder: 6,
      content: { limit: 12, timeWindowDays: 90, emptyText: 'Check back soon.' },
    });
  });

  it('omits the override when cleared, so the built-in copy returns', async () => {
    const user = setupTimers();
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="meetings"
        blockOrder={6}
        content={{ limit: 10, emptyText: 'Custom.' }}
      />,
    );

    await user.clear(screen.getByLabelText('Empty-state message'));
    await settleAutosave();

    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).toEqual({ limit: 10 });
    expect(sent).not.toHaveProperty('emptyText');
  });

  it('previews the built-in copy as the placeholder for the block type', () => {
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="documents"
        blockOrder={6}
        content={{ limit: 5 }}
      />,
    );
    expect(screen.getByLabelText('Empty-state message')).toHaveAttribute(
      'placeholder',
      'No documents available.',
    );
  });
});
