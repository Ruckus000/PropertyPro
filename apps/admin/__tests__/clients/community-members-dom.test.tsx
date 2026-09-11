// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MEMBER = {
  roleId: 1,
  userId: 'user-1',
  email: 'owner@example.com',
  fullName: 'Dana Owner',
  phone: null,
  role: 'resident',
  designation: null,
  displayTitle: null,
  isUnitOwner: true,
  lastSignInAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Members load OK; `deleteResponse` decides what the DELETE does. */
function mockFetch(deleteResponse: Partial<Response> & { ok: boolean }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'DELETE') {
      return deleteResponse as Response;
    }
    return { ok: true, json: async () => ({ members: [MEMBER] }) } as Response;
  });
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  const { CommunityMembers } = await import('@/components/clients/CommunityMembers');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CommunityMembers communityId={42} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickRemoveThenConfirm() {
  const remove = container.querySelector('[aria-label="Remove Dana Owner"]') as HTMLButtonElement;
  expect(remove, 'the member row did not render').not.toBeNull();
  await act(async () => remove.click());

  const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Confirm') as HTMLButtonElement;
  expect(confirm, 'the confirm button did not render').not.toBeNull();
  await act(async () => confirm.click());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CommunityMembers remove failure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('tells the operator when a removal is refused, and keeps the member on screen', async () => {
    mockFetch({ ok: false, json: async () => ({ error: { message: 'Root manager cannot be removed' } }) });
    await mount();
    await clickRemoveThenConfirm();

    const alert = container.querySelector('[role="alert"]');
    expect(alert, 'no role="alert" rendered for the failed removal').not.toBeNull();
    expect(alert!.textContent).toContain('Root manager cannot be removed');
    // The row must survive: the member was NOT removed, so a list that dropped
    // it would be lying in the same direction the silent failure did.
    expect(container.querySelector('[aria-label="Remove Dana Owner"]')).not.toBeNull();
  });

  it('falls back to house-style copy when the response carries no message', async () => {
    mockFetch({ ok: false, json: async () => ({}) });
    await mount();
    await clickRemoveThenConfirm();

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain("We couldn't remove this member");
  });

  it('removes the row and shows no alert on success', async () => {
    mockFetch({ ok: true, json: async () => ({}) });
    await mount();
    await clickRemoveThenConfirm();

    expect(container.querySelector('[aria-label="Remove Dana Owner"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('CommunityMembers sortable headers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('reports sort direction with aria-sort, not by chevron alone', async () => {
    mockFetch({ ok: true, json: async () => ({}) });
    await mount();

    const headers = [...container.querySelectorAll('th')];
    const name = headers.find((th) => th.textContent?.startsWith('Name'))!;
    const role = headers.find((th) => th.textContent?.startsWith('Role'))!;

    // Default sort is name ascending.
    expect(name.getAttribute('aria-sort')).toBe('ascending');
    expect(role.getAttribute('aria-sort')).toBe('none');

    // Clicking the active column flips it; clicking another moves the marker.
    await act(async () => (name.querySelector('button') as HTMLButtonElement).click());
    expect(name.getAttribute('aria-sort')).toBe('descending');

    await act(async () => (role.querySelector('button') as HTMLButtonElement).click());
    expect(role.getAttribute('aria-sort')).toBe('ascending');
    expect(name.getAttribute('aria-sort')).toBe('none');
  });
});
