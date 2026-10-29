/**
 * The Add records drawer (website builder, D11, C3).
 *
 * The drawer's own state is real. Mocked: the categories read, the upload and
 * the checklist mutations, because those are the network. The mocks share a
 * small FAKE SERVER (`links`) that behaves the way the real one does on the one
 * point that matters here: an upload that does not say `skipAutoLink` is linked
 * by the server to the record its name points at, and `linkDocument` writes a
 * link without clearing any other. So "a file re-pointed with Change ends up
 * linked only to the chosen record" is asserted on the resulting links, not on
 * a mock's call arguments.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MissingRecord } from '@/lib/site-editor/records-status';
import { resolveDocumentCategoryId } from '@/lib/documents/categories';

const { uploadMock, linkMock, markMock, categoriesState } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  linkMock: vi.fn(),
  markMock: vi.fn(),
  categoriesState: { isLoading: false },
}));

vi.mock('@/hooks/use-document-upload', () => ({ uploadDocumentFile: uploadMock }));
vi.mock('@/hooks/use-compliance-mutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutateAsync: linkMock },
    markNotApplicable: { mutateAsync: markMock },
  }),
}));
vi.mock('@/hooks/use-document-categories', () => {
  const categories = [
    { id: 11, name: 'Financial Records', slug: 'financial-records', description: null },
    { id: 12, name: 'Governing Documents', slug: 'governing-documents', description: null },
    { id: 13, name: 'Contracts', slug: 'contracts', description: null },
    { id: 14, name: 'Insurance', slug: 'insurance', description: null },
    { id: 15, name: 'Inspection Reports', slug: 'inspection-reports', description: null },
  ];
  return {
    useDocumentCategories: () => ({
      categories,
      isLoading: categoriesState.isLoading,
      error: null,
      resolveCategoryId: (name: string | null | undefined) => resolveDocumentCategoryId(categories, name),
    }),
  };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { AddRecordsDrawer } from '@/components/website-home/records/add-records-drawer';

const COMMUNITY_ID = 42;
const BUDGET: MissingRecord = {
  itemId: 1, templateKey: '718_budget', title: 'Annual budget', category: 'financial_records', state: 'nothing_posted',
};
const REPORT: MissingRecord = {
  itemId: 2, templateKey: '718_financial_report', title: 'Annual financial report', category: 'financial_records', state: 'nothing_posted',
};
const BYLAWS: MissingRecord = {
  itemId: 3, templateKey: '718_bylaws', title: 'Bylaws', category: 'governing_documents', state: 'nothing_posted',
};
const INSURANCE: MissingRecord = {
  itemId: 4, templateKey: '718_insurance_policies', title: 'Insurance policies', category: 'insurance', state: 'nothing_posted',
};
const SIRS: MissingRecord = {
  itemId: 5, templateKey: '718_sirs', title: 'Structural integrity reserve study', category: 'operations', state: 'nothing_posted',
};
const VIDEO: MissingRecord = {
  itemId: 6, templateKey: '718_video_recordings', title: 'Video recordings of meetings', category: 'meeting_records', state: 'nothing_posted',
};

const pdf = (name: string) => new File(['%PDF-1.4 sample'], name, { type: 'application/pdf' });

/** The fake server's checklist links: record id -> the documents linked to it. */
let links: Map<number, number[]>;
let nextDocumentId: number;
const linkedItemsOf = (documentId: number) =>
  [...links].filter(([, docs]) => docs.includes(documentId)).map(([itemId]) => itemId);

function renderDrawer(over: { missing?: MissingRecord[]; conditional?: MissingRecord[]; onClose?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const onClose = over.onClose ?? vi.fn();
  render(
    <AddRecordsDrawer
      communityId={COMMUNITY_ID}
      missing={over.missing ?? [BUDGET, REPORT, BYLAWS, INSURANCE]}
      conditional={over.conditional ?? []}
      onClose={onClose}
    />,
    { wrapper },
  );
  return { onClose, user: userEvent.setup({ pointerEventsCheck: 0, applyAccept: false }), client };
}

async function drop(user: ReturnType<typeof userEvent.setup>, ...files: File[]) {
  await user.upload(screen.getByLabelText(/choose files/i), files);
}

function rowOf(fileName: string): HTMLElement {
  return screen.getByText(fileName).closest('li') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  categoriesState.isLoading = false;
  links = new Map();
  nextDocumentId = 100;
  uploadMock.mockImplementation(async (request: { file: File; skipAutoLink?: boolean }) => {
    const id = nextDocumentId++;
    // The real server links an uploaded document to the one record its name
    // points at, unless the caller asked it not to.
    if (request.skipAutoLink !== true && /budget/i.test(request.file.name)) {
      links.set(BUDGET.itemId, [...(links.get(BUDGET.itemId) ?? []), id]);
    }
    return { document: { id }, warnings: [] };
  });
  linkMock.mockImplementation(async ({ itemId, documentId }: { itemId: number; documentId: number }) => {
    // The PATCH writes this record's link and touches no other.
    links.set(itemId, [...(links.get(itemId) ?? []), documentId]);
  });
  markMock.mockResolvedValue(undefined);
});

describe('proposals', () => {
  it('proposes "Annual financial report" for 2025-financial-report.pdf', async () => {
    const { user } = renderDrawer();

    await drop(user, pdf('2025-financial-report.pdf'));

    const row = within(rowOf('2025-financial-report.pdf'));
    expect(row.getByText('Annual financial report')).toBeInTheDocument();
    expect(row.getByText('Matched')).toBeInTheDocument();
    expect(row.getByRole('button', { name: /change record for 2025-financial-report\.pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post 1 record' })).toBeInTheDocument();
  });

  it('shows "Pick a record", no Matched badge and nothing to post for a file the name does not place', async () => {
    const { user } = renderDrawer();

    await drop(user, pdf('scan0042.pdf'), pdf('insurance-certificate.pdf'));

    for (const name of ['scan0042.pdf', 'insurance-certificate.pdf']) {
      const row = within(rowOf(name));
      // A file name is no evidence for the insurance records, so they are never proposed either.
      expect(row.getByRole('combobox')).toHaveDisplayValue('Pick a record');
      expect(row.queryByText('Matched')).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Post records' })).toBeDisabled();
  });

  it('proposes a record for one file only: the second claimant is left to pick', async () => {
    const { user } = renderDrawer();

    await drop(user, pdf('2025-financial-report.pdf'), pdf('2024-financial-report.pdf'));

    expect(within(rowOf('2025-financial-report.pdf')).getByText('Matched')).toBeInTheDocument();
    const second = within(rowOf('2024-financial-report.pdf'));
    expect(second.getByRole('combobox')).toHaveDisplayValue('Pick a record');
    expect(second.queryByText('Matched')).not.toBeInTheDocument();
    // The claimed record cannot be picked twice.
    expect(second.getByRole('option', { name: /Annual financial report \(chosen for another file\)/ })).toBeDisabled();
  });

  it('Change overrides the proposal', async () => {
    const { user } = renderDrawer();
    await drop(user, pdf('2025-financial-report.pdf'));

    await user.click(screen.getByRole('button', { name: /change record for 2025-financial-report\.pdf/i }));
    await user.selectOptions(screen.getByRole('combobox'), 'Bylaws');

    const row = within(rowOf('2025-financial-report.pdf'));
    expect(row.getByText('Bylaws')).toBeInTheDocument();
    expect(row.queryByText('Annual financial report')).not.toBeInTheDocument();
    // It is the person's choice now, not the name's.
    expect(row.queryByText('Matched')).not.toBeInTheDocument();
    expect(row.queryByRole('combobox')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(row.getByRole('button', { name: /change record for/i })).toHaveFocus(),
    );
  });

  it('says why a file that cannot be posted cannot be, and leaves it out of the count', async () => {
    const { user } = renderDrawer();

    await drop(user, new File(['a,b'], 'budget.xlsx'), pdf('bylaws.pdf'));

    const refused = within(rowOf('budget.xlsx'));
    expect(refused.getByText(/Spreadsheets can’t be posted/)).toBeInTheDocument();
    expect(refused.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post 1 record' })).toBeEnabled();
  });
});

describe('redaction attestation', () => {
  it('a sensitive category needs the attestation before Post is enabled', async () => {
    const { user } = renderDrawer();
    await drop(user, pdf('2025-financial-report.pdf'), pdf('2026-budget.pdf'));

    // Both files file under Financial Records, a sensitive category: one question, not two.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    const post = screen.getByRole('button', { name: 'Post 2 records' });
    expect(post).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));

    expect(post).toBeEnabled();
  });

  it('asks nothing when no chosen record files under a sensitive category', async () => {
    const { user } = renderDrawer({ missing: [BUDGET, SIRS] });
    await drop(user, pdf('scan.pdf'));
    await user.selectOptions(screen.getByRole('combobox'), 'Structural integrity reserve study');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post 1 record' })).toBeEnabled();
  });

  it('sends the attestation only for the file whose category needs it', async () => {
    const { user } = renderDrawer({ missing: [BUDGET, SIRS] });
    await drop(user, pdf('2026-budget.pdf'), pdf('scan.pdf'));
    await user.selectOptions(within(rowOf('scan.pdf')).getByRole('combobox'), 'Structural integrity reserve study');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Post 2 records' }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    const sent = new Map(
      uploadMock.mock.calls.map(([request]) => [request.file.name, request.redactionAttested]),
    );
    expect(sent.get('2026-budget.pdf')).toBe(true);
    expect(sent.get('scan.pdf')).toBe(false);
  });
});

describe('posting', () => {
  it('Post uploads then links each file', async () => {
    const { user } = renderDrawer();
    await drop(user, pdf('2025-financial-report.pdf'), pdf('bylaws.pdf'));
    await user.click(screen.getByRole('checkbox')); // Financial Records is sensitive

    await user.click(screen.getByRole('button', { name: 'Post 2 records' }));

    await waitFor(() => expect(linkMock).toHaveBeenCalledTimes(2));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: COMMUNITY_ID,
        title: '2025-financial-report',
        categoryId: 11,
        redactionAttested: true,
        skipAutoLink: true,
      }),
    );
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'bylaws', categoryId: 12, redactionAttested: false, skipAutoLink: true }),
    );
    expect(linkMock).toHaveBeenCalledWith({ itemId: REPORT.itemId, documentId: 100 });
    expect(linkMock).toHaveBeenCalledWith({ itemId: BYLAWS.itemId, documentId: 101 });
    // Each link comes after its own upload.
    uploadMock.mock.results.forEach((_, index) => {
      expect(uploadMock.mock.invocationCallOrder[index]).toBeLessThan(linkMock.mock.invocationCallOrder[index]!);
    });

    const status = screen.getByRole('status');
    expect(within(status).getByText('Posted 2025-financial-report.pdf as Annual financial report.')).toBeInTheDocument();
    expect(within(status).getByText('Posted bylaws.pdf as Bylaws.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 posted' })).toHaveFocus();
    expect(screen.queryByRole('list', { name: 'Files to post' })).not.toBeInTheDocument();
  });

  it('uploads two files at a time', async () => {
    const releases: Array<() => void> = [];
    uploadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ document: { id: 200 + releases.length }, warnings: [] }));
        }),
    );
    const { user } = renderDrawer({ missing: [BUDGET, BYLAWS, INSURANCE] });
    await drop(user, pdf('2026-budget.pdf'), pdf('bylaws.pdf'), pdf('scan.pdf'));
    await user.selectOptions(within(rowOf('scan.pdf')).getByRole('combobox'), 'Insurance policies');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Post 3 records' }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    expect(releases).toHaveLength(2); // the third waits
    releases[0]!();
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(3));
    releases[1]!();
    releases[2]!();
    await waitFor(() => expect(linkMock).toHaveBeenCalledTimes(3));
  });

  it('one file failing does not stop the others, and the result says which is which', async () => {
    uploadMock.mockImplementation(async (request: { file: File }) => {
      if (request.file.name === 'bylaws.pdf') throw new Error('This file is too large to post');
      return { document: { id: nextDocumentId++ }, warnings: [] };
    });
    const { user } = renderDrawer();
    await drop(user, pdf('2025-financial-report.pdf'), pdf('bylaws.pdf'));
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Post 2 records' }));

    const status = await screen.findByRole('status');
    await waitFor(() =>
      expect(within(status).getByText('Posted 2025-financial-report.pdf as Annual financial report.')).toBeInTheDocument(),
    );
    expect(within(status).getByText("We couldn't post bylaws.pdf. This file is too large to post.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "1 posted, 1 didn't post" })).toBeInTheDocument();
    // Only the one that did not post is still in the list, ready to be sent again.
    const list = screen.getByRole('list', { name: 'Files to post' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('bylaws.pdf')).toBeInTheDocument();
    expect(linkMock).toHaveBeenCalledTimes(1);

    // Retrying sends the failed file only.
    uploadMock.mockClear();
    uploadMock.mockImplementation(async () => ({ document: { id: 300 }, warnings: [] }));
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '2 posted' })).toBeInTheDocument());
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ file: expect.objectContaining({ name: 'bylaws.pdf' }) }));
  });

  it('a file that uploaded but could not be linked is not uploaded again', async () => {
    linkMock.mockRejectedValueOnce(new Error('PATCH failed: 500'));
    const { user } = renderDrawer({ missing: [BYLAWS] });
    await drop(user, pdf('bylaws.pdf'));

    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    expect(
      await screen.findByText("bylaws.pdf is posted, but we couldn't link it to Bylaws. Press Post to try the link again."),
    ).toBeInTheDocument();
    // The raw error is not shown.
    expect(screen.queryByText(/PATCH failed/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await waitFor(() => expect(screen.getByText('Posted bylaws.pdf as Bylaws.')).toBeInTheDocument());
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(linkMock).toHaveBeenCalledTimes(2);
    expect(linkMock).toHaveBeenLastCalledWith({ itemId: BYLAWS.itemId, documentId: 100 });
  });

  it('once a file has uploaded, its record is locked: no Change, and the retry links the original record', async () => {
    linkMock.mockRejectedValueOnce(new Error('PATCH failed: 500'));
    const { user } = renderDrawer({ missing: [BYLAWS, INSURANCE] });
    await drop(user, pdf('bylaws.pdf'));
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));
    await screen.findByText(/bylaws.pdf is posted, but we couldn't link it/);

    const row = within(rowOf('bylaws.pdf'));
    expect(row.getByText('Bylaws')).toBeInTheDocument();
    expect(row.queryByRole('button', { name: /change record/i })).not.toBeInTheDocument();
    expect(row.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await waitFor(() => expect(screen.getByText('Posted bylaws.pdf as Bylaws.')).toBeInTheDocument());
    expect(linkMock).toHaveBeenLastCalledWith({ itemId: BYLAWS.itemId, documentId: 100 });
    expect(linkedItemsOf(100)).toEqual([BYLAWS.itemId]);
  });

  it('removing a file that posted but could not be linked keeps saying where it is', async () => {
    linkMock.mockRejectedValueOnce(new Error('PATCH failed: 500'));
    const { user } = renderDrawer({ missing: [BYLAWS] });
    await drop(user, pdf('bylaws.pdf'));
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));
    await screen.findByText(/bylaws.pdf is posted, but we couldn't link it/);

    await user.click(screen.getByRole('button', { name: 'Remove bylaws.pdf' }));

    expect(screen.queryByRole('list', { name: 'Files to post' })).not.toBeInTheDocument();
    expect(screen.getByText(/bylaws.pdf is posted, but we couldn't link it/)).toBeInTheDocument();
    expect(
      screen.getByText("A file that posted but couldn't be linked stays in Documents, so nothing is lost."),
    ).toBeInTheDocument();
  });

  it('a link-only retry asks for no attestation again', async () => {
    linkMock.mockRejectedValueOnce(new Error('PATCH failed: 500'));
    const { user } = renderDrawer({ missing: [REPORT] });
    await drop(user, pdf('2025-financial-report.pdf'));
    await user.click(screen.getByRole('checkbox')); // Financial Records is sensitive
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));
    await screen.findByText(/is posted, but we couldn't link it/);

    // Nothing more is uploaded on the retry, so there is nothing to attest to.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Post 1 record' });
    expect(retry).toBeEnabled();

    await user.click(retry);

    await waitFor(() => expect(screen.getByText(/^Posted 2025-financial-report\.pdf/)).toBeInTheDocument());
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('a file re-pointed with Change ends up linked only to the chosen record', async () => {
    const { user } = renderDrawer();
    // Named for the budget: left alone, the server would link it there by itself.
    await drop(user, pdf('2026-budget.pdf'));
    expect(within(rowOf('2026-budget.pdf')).getByText('Annual budget')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /change record for 2026-budget\.pdf/i }));
    await user.selectOptions(screen.getByRole('combobox'), 'Annual financial report');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await waitFor(() => expect(screen.getByText('Posted 2026-budget.pdf as Annual financial report.')).toBeInTheDocument());
    expect(linkedItemsOf(100)).toEqual([REPORT.itemId]);
    // The budget the name pointed at is still missing.
    expect(links.get(BUDGET.itemId)).toBeUndefined();
  });
});

describe('may apply', () => {
  it('conditional items show their hint', () => {
    renderDrawer({ missing: [BUDGET], conditional: [SIRS, VIDEO] });

    const group = screen.getByRole('region', { name: 'May apply to you' });
    const sirs = within(group).getByText('Structural integrity reserve study').closest('li') as HTMLElement;
    expect(within(sirs).getByText('Usually applies to buildings three or more stories tall.')).toBeInTheDocument();
    expect(within(sirs).getByRole('button', { name: /doesn't apply/i })).toBeInTheDocument();
    const video = within(group).getByText('Video recordings of meetings').closest('li') as HTMLElement;
    expect(within(video).getByText('Usually applies when meetings are held by video conference.')).toBeInTheDocument();
  });

  it('shows no May apply group when nothing may not apply', () => {
    renderDrawer({ conditional: [] });

    expect(screen.queryByText('May apply to you')).not.toBeInTheDocument();
  });

  it('Doesn\'t apply opens the dialog; marking a record takes it off the list', async () => {
    const { user } = renderDrawer({ conditional: [SIRS, VIDEO] });

    await user.click(screen.getByRole('button', { name: "Doesn't apply: Structural integrity reserve study" }));
    const dialog = await screen.findByRole('dialog', { name: /Structural integrity reserve study/ });
    await user.click(within(dialog).getByLabelText('The building is under three stories'));
    await user.click(within(dialog).getByRole('button', { name: 'Mark as not applying' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Structural integrity/ })).not.toBeInTheDocument());
    expect(markMock).toHaveBeenCalledWith({ itemId: SIRS.itemId, reason: 'The building is under three stories' });
    expect(screen.queryByText('Structural integrity reserve study')).not.toBeInTheDocument();
    expect(screen.getByText('Video recordings of meetings')).toBeInTheDocument();
  });
});

describe('focus and announcements', () => {
  it('the results region is on the page from the start, empty', () => {
    renderDrawer();

    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
  });

  it('after Doesn\'t apply, focus moves to the May apply heading while the group has items', async () => {
    const { user } = renderDrawer({ conditional: [SIRS, VIDEO] });

    await user.click(screen.getByRole('button', { name: "Doesn't apply: Structural integrity reserve study" }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('The building is under three stories'));
    await user.click(within(dialog).getByRole('button', { name: 'Mark as not applying' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'May apply to you' })).toHaveFocus());
  });

  it('after the last May apply item is marked, focus moves to Post', async () => {
    const { user } = renderDrawer({ missing: [BYLAWS], conditional: [SIRS] });
    await drop(user, pdf('bylaws.pdf'));

    await user.click(screen.getByRole('button', { name: "Doesn't apply: Structural integrity reserve study" }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('The building is under three stories'));
    await user.click(within(dialog).getByRole('button', { name: 'Mark as not applying' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Post 1 record' })).toHaveFocus());
    expect(screen.queryByText('May apply to you')).not.toBeInTheDocument();
  });
});

describe('closing', () => {
  it('Cancel closes the drawer', async () => {
    const { user, onClose } = renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reads Done once something has posted', async () => {
    const { user, onClose } = renderDrawer({ missing: [BYLAWS] });
    await drop(user, pdf('bylaws.pdf'));
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('says a file that posted but could not be linked stays in Documents', async () => {
    const note = "A file that posted but couldn't be linked stays in Documents, so nothing is lost.";
    linkMock.mockRejectedValueOnce(new Error('PATCH failed: 500'));
    const { user } = renderDrawer({ missing: [BYLAWS, BUDGET] });
    await drop(user, pdf('bylaws.pdf'));
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));

    await screen.findByText(/bylaws.pdf is posted, but we couldn't link it/);
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    // A file that simply posted says nothing of the kind.
    await user.click(screen.getByRole('button', { name: 'Post 1 record' }));
    await screen.findByText('Posted bylaws.pdf as Bylaws.');
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });
});
