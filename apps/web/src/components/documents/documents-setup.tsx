'use client';

/**
 * The Documents setup guide: what a manager sees on an empty library, and
 * again from "Continue setup" (spec docs/design-system/patterns/empty-states.md
 * §4.1, §4.2; plan D9–D13).
 *
 * Condo / HOA: one slot per statutory record, grouped into steps. A slot
 * uploads through the Compliance page's own modal and links the file to that
 * record (upload with skipAutoLink, then link: the same two calls Compliance
 * makes). A conditional record can be set aside with the existing reason
 * dialog. Apartment: the community's own folders as a suggested starter set;
 * a slot opens the library's upload panel on that folder.
 *
 * Everything shown is derived from rows the page already loaded; nothing is
 * example data (spec rule 6).
 */

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { DocumentsScene } from '@propertypro/ui';
import { requiredSectionStatute, unitThreshold, type CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import {
  ContextLinks,
  ContextRows,
  ContextSection,
  SetupGuide,
  SetupSlot,
  SetupSlotList,
  type SetupStep,
} from '@/components/shared/setup-guide';
import { UploadDocumentModal } from '@/components/compliance/upload-document-modal';
import { getTemplateDocumentCategory } from '@/components/compliance/compliance-visibility';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { NotApplicableDialog } from '@/components/website-home/records/not-applicable-dialog';
import { useComplianceMutations } from '@/hooks/use-compliance-mutations';
import {
  buildStarterSet,
  buildStatutorySteps,
  hasDraft,
  isApplicable,
  isPosted,
  statutoryProgress,
  type SetupCategory,
} from '@/lib/documents/setup-model';

const documentCategoryFor = (item: Pick<ChecklistItemData, 'templateKey' | 'category'>) =>
  getTemplateDocumentCategory(item.templateKey, item.category);

const HELP_UPLOAD = { href: '/help/documents/upload-document', label: 'Upload a document' };
const HELP_ORGANIZE = { href: '/help/documents/organize-library', label: 'Keep the document library organized' };

interface DocumentsSetupProps {
  communityId: number;
  communityType: CommunityType;
  /** The statutory checklist (condo / HOA). Empty for an apartment. */
  checklist: ChecklistItemData[];
  categories: SetupCategory[];
  /** How many documents each category holds (apartment progress). */
  documentCountByCategory: Map<number, number>;
  /** Document titles by id, to show what fills a slot. */
  documentTitleById: Map<number, string>;
  /** Open the library's multi-file upload panel, on one folder or none. */
  onOpenUploadPanel: (categoryId: number | null) => void;
  /** Called after an upload or a "doesn't apply", so the page refetches. */
  onChanged: () => void;
  /** Text for the page's polite live region; the page owns it so it outlives this guide. */
  onAnnounce: (text: string) => void;
  /** Present when the library exists behind the guide ("Continue setup"). */
  onClose?: () => void;
}

export function DocumentsSetup(props: DocumentsSetupProps) {
  return props.communityType === 'apartment' ? <ApartmentSetup {...props} /> : <StatutorySetup {...props} />;
}

function StatutorySetup({
  communityId,
  communityType,
  checklist,
  documentTitleById,
  onOpenUploadPanel,
  onChanged,
  onAnnounce,
  onClose,
}: DocumentsSetupProps) {
  const [uploadItem, setUploadItem] = React.useState<ChecklistItemData | null>(null);
  const [notApplicableItem, setNotApplicableItem] = React.useState<ChecklistItemData | null>(null);
  const { linkDocument } = useComplianceMutations(communityId);

  const steps = buildStatutorySteps(checklist, documentCategoryFor);
  const progress = statutoryProgress(steps);
  const isCondo = communityType === 'condo_718';
  // Statute and size threshold from the shared table, so this cannot drift
  // from the website and Compliance copy.
  const statute = requiredSectionStatute(communityType);
  const threshold = unitThreshold(communityType);

  function linkUpload(item: ChecklistItemData, documentId: number) {
    linkDocument.mutate(
      { itemId: item.id, documentId, replace: item.documentId != null },
      {
        onSuccess: () => {
          const posted = progress.posted + (item.isConditional ? 0 : 1);
          onAnnounce(`${item.title} posted. ${posted} of ${progress.required} required.`);
        },
        onError: (err) => toast.error(err.message),
        // The file is posted either way: refresh so the library shows it.
        onSettled: onChanged,
      },
    );
  }

  const guideSteps: SetupStep[] = steps.map((step) => {
    const items = step.items as ChecklistItemData[];
    const nextInStep = items.find((i) => !i.isConditional && isApplicable(i) && !isPosted(i) && !hasDraft(i));
    return {
      id: step.key,
      label: step.label,
      done: step.done,
      heading: step.heading,
      description: step.description,
      countLabel: step.required > 0 ? `${step.posted} of ${step.required} posted` : 'None required',
      items: items.filter(isApplicable).map((i) => ({ label: i.title, conditional: i.isConditional })),
      action: nextInStep ? <Button onClick={() => setUploadItem(nextInStep)}>Upload the next record</Button> : undefined,
      content: (
        <div className="flex flex-col gap-6">
          <SetupSlotList label={`${step.label} records`}>
            {items.map((item) => (
              <StatutorySlot
                key={item.id}
                item={item}
                next={item.id === nextInStep?.id}
                documentTitleById={documentTitleById}
                onAdd={() => setUploadItem(item)}
                onNotApplicable={() => setNotApplicableItem(item)}
              />
            ))}
          </SetupSlotList>
          <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
            <p className="min-w-0 flex-[1_1_18rem] text-sm text-content-secondary">
              Several files at once? Upload them together. A file that clearly matches one record is filed there.
            </p>
            <Button variant="outline" onClick={() => onOpenUploadPanel(null)}>
              Upload several
            </Button>
          </div>
        </div>
      ),
    };
  });

  return (
    <>
      <SetupGuide
        eyebrow="Owner portal records"
        title="Post the records owners can see"
        description={`Florida asks ${isCondo ? 'condo associations' : 'HOAs'} with ${threshold?.minUnits ?? ''} or more ${threshold?.unitNoun ?? ''} to post these for owners (${statute ?? ''}). Add a file to any slot and it’s filed and counted.`}
        progress={{ done: progress.posted, total: progress.required, label: 'required posted' }}
        facts={[
          ...(progress.conditionalOpen > 0 ? [{ label: `${progress.conditionalOpen} more only if they apply` }] : []),
          { icon: <Smartphone aria-hidden="true" className="size-4" />, label: 'Owners open them in their portal' },
        ]}
        illustration={<DocumentsScene size="hero" />}
        steps={guideSteps}
        onClose={onClose}
        context={
          <>
            <ContextSection title="Where owners will see them">
              <p className="text-sm text-content-secondary">
                Each record appears in the owner portal as soon as it&apos;s posted.
              </p>
            </ContextSection>
            <ContextSection title="Posting deadlines">
              <p className="text-sm text-content-secondary">
                Each record has its own posting deadline. Compliance lists the dates and anything overdue.
              </p>
              <ContextLinks links={[{ href: `/communities/${communityId}/compliance`, label: 'Open Compliance' }]} />
            </ContextSection>
            <ContextSection title="Help">
              <ContextLinks
                links={[
                  { href: '/help/compliance/posting-requirements', label: 'Which records Florida requires you to post' },
                  HELP_UPLOAD,
                  HELP_ORGANIZE,
                ]}
              />
            </ContextSection>
          </>
        }
      />

      {uploadItem && (
        <UploadDocumentModal
          communityId={communityId}
          defaultTitle={uploadItem.title}
          categoryName={documentCategoryFor(uploadItem)}
          // The slot names the record, so the server must not link the file elsewhere first.
          skipAutoLink
          onUploaded={(documentId) => {
            linkUpload(uploadItem, documentId);
            setUploadItem(null);
          }}
          onClose={() => setUploadItem(null)}
        />
      )}
      {notApplicableItem && (
        <NotApplicableDialog
          communityId={communityId}
          item={{ itemId: notApplicableItem.id, templateKey: notApplicableItem.templateKey, title: notApplicableItem.title }}
          onDone={(marked) => {
            if (marked) {
              onChanged();
              onAnnounce(`${notApplicableItem.title} marked as not applying. It no longer counts.`);
            }
            setNotApplicableItem(null);
          }}
        />
      )}
    </>
  );
}

function StatutorySlot({
  item,
  next,
  documentTitleById,
  onAdd,
  onNotApplicable,
}: {
  item: ChecklistItemData;
  next: boolean;
  documentTitleById: Map<number, string>;
  onAdd: () => void;
  onNotApplicable: () => void;
}) {
  const tag = item.isConditional ? 'If it applies' : 'Required';
  if (!isApplicable(item)) {
    return (
      <SetupSlot
        title={item.title}
        tag={tag}
        filledWith={item.notApplicableReason ? `Doesn’t apply: ${item.notApplicableReason}` : 'Doesn’t apply'}
      />
    );
  }
  if (isPosted(item)) {
    return (
      <SetupSlot title={item.title} tag={tag} filledWith={documentTitleById.get(item.documentId ?? -1) ?? 'Posted'} />
    );
  }
  if (item.documentState === 'draft') {
    // A saved draft is linked already: post it from the library rather than upload a second file.
    return <SetupSlot title={item.title} tag={tag} description="Draft saved. Post it from the library." />;
  }
  return (
    <SetupSlot
      title={item.title}
      tag={tag}
      next={next}
      onAdd={onAdd}
      {...(item.isConditional ? { onNotApplicable } : {})}
    />
  );
}

function ApartmentSetup({
  communityType,
  categories,
  documentCountByCategory,
  onOpenUploadPanel,
  onClose,
}: DocumentsSetupProps) {
  const { residentFacing, staffOnly } = buildStarterSet(categories, communityType);
  const filled = (c: SetupCategory) => (documentCountByCategory.get(c.id) ?? 0) > 0;
  const essentialsFilled = residentFacing.filter(filled).length;
  const nextEssential = residentFacing.find((c) => !filled(c));
  const staffFilled = staffOnly.filter(filled).length;

  const steps: SetupStep[] = [
    {
      id: 'folders',
      label: 'Folders set up',
      done: true,
      system: true,
      heading: 'Your folders are ready',
      description: `Your community has ${categories.length} folders to file into.`,
      items: categories.map((c) => ({ label: c.name })),
    },
    {
      id: 'essentials',
      label: 'Resident essentials',
      done: residentFacing.length > 0 && essentialsFilled === residentFacing.length,
      heading: 'Post the resident essentials',
      description: 'Tenants can open these from their own portal, which saves you the emails.',
      countLabel: `${essentialsFilled} of ${residentFacing.length} with a file`,
      items: residentFacing.map((c) => ({ label: c.name })),
      action: nextEssential ? (
        <Button onClick={() => onOpenUploadPanel(nextEssential.id)}>Upload to {nextEssential.name}</Button>
      ) : undefined,
      content: (
        <CategorySlots categories={residentFacing} next={nextEssential} filled={filled} onAdd={onOpenUploadPanel} />
      ),
    },
    {
      id: 'staff',
      label: 'Staff records',
      done: staffOnly.length > 0 && staffFilled === staffOnly.length,
      heading: 'File the records only staff see',
      description: 'Tenants never see these folders. Fill them as the paperwork arrives.',
      countLabel: 'Staff only',
      items: staffOnly.map((c) => ({ label: c.name })),
      content: <CategorySlots categories={staffOnly} filled={filled} onAdd={onOpenUploadPanel} />,
    },
  ];

  return (
    <SetupGuide
      eyebrow="Document library"
      title="Give residents the papers they ask for most"
      description="Start with the ones your tenants can open from their own portal. This is a suggested starter set, not a legal list, so skip anything you don't use."
      {...(residentFacing.length > 0
        ? { progress: { done: essentialsFilled, total: residentFacing.length, label: 'resident essentials' } }
        : {})}
      facts={[
        { icon: <CheckCircle2 aria-hidden="true" className="size-4 text-status-success" />, label: `${categories.length} folders already set up` },
        { icon: <Smartphone aria-hidden="true" className="size-4" />, label: 'Tenants open these in their portal' },
      ]}
      illustration={<DocumentsScene size="hero" />}
      steps={steps}
      onClose={onClose}
      context={
        <>
          <ContextSection title="Who sees what">
            <ContextRows
              rows={[
                { label: 'Tenants', detail: residentFacing.map((c) => c.name).join(', ') || 'No folders yet' },
                { label: 'Your staff', detail: 'Every folder' },
              ]}
            />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[HELP_UPLOAD, HELP_ORGANIZE]} />
          </ContextSection>
        </>
      }
    />
  );
}

function CategorySlots({
  categories,
  next,
  filled,
  onAdd,
}: {
  categories: SetupCategory[];
  next?: SetupCategory;
  filled: (c: SetupCategory) => boolean;
  onAdd: (categoryId: number) => void;
}) {
  return (
    <SetupSlotList label="Folders">
      {categories.map((c) => (
        <SetupSlot
          key={c.id}
          title={c.name}
          next={c.id === next?.id}
          {...(filled(c) ? { filledWith: 'Has a file' } : { onAdd: () => onAdd(c.id) })}
        />
      ))}
    </SetupSlotList>
  );
}
