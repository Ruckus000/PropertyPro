/**
 * DocumentsBlock — SoR block that reads community documents from the DB.
 *
 * Async server component: validates block.content via documentsBlockSchema,
 * fetches via getPublicCommunityScopedReader, and hands the result to the pure
 * view. Markup lives in DocumentsBlockView so the editor canvas renders exactly
 * what the public site renders — see BlockViewProps in ./types.
 *
 * Download URL strategy (v1): links to the authenticated download route
 * /api/v1/documents/[id]/download?communityId=X. This route requires an active
 * session, so visitors will be redirected to login. A follow-up PR will add a
 * public presigned-URL path for unauthenticated access once the per-document
 * public_access boolean is added to the documents table.
 *
 * Category note: the documentsBlockSchema includeCategories values
 * ('budget', 'minutes', 'financial', 'rules', 'other') are matched against the
 * community's category names BY MEANING (`documentMatchesSectionCategories`),
 * not as strings — there is no slug column, and the names are free text.
 *
 * Never an empty box (D14). The shell lists the public documents when there are
 * any, summarises the owners' records (`OwnerRecordsSummary`, below the list
 * when both) when any group has one posted, and renders nothing when it has
 * neither. The view keeps its "No documents available." text, because the editor
 * canvas renders the view directly and a manager needs to see the empty section.
 */
import { documentsBlockSchema, type DocumentsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { DocumentsBlockView } from './DocumentsBlockView';
import { OwnerRecordsSummary } from './OwnerRecordsSummary';
import type { BlockRendererProps } from './types';

export async function DocumentsBlock(props: BlockRendererProps) {
  const parsed = documentsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'documents block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: DocumentsBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const [items, recordGroups] = await Promise.all([
    reader.listDocuments({
      limit: config.limit,
      includeCategories: config.includeCategories,
    }),
    reader.listOwnerRecordGroups(),
  ]);

  const hasPublicDocuments = items.length > 0;
  const hasOwnerRecords = recordGroups.some((group) => group.postedCount > 0);
  if (!hasPublicDocuments && !hasOwnerRecords) return null;

  return (
    <>
      {hasPublicDocuments ? (
        <DocumentsBlockView
          blockId={props.block.id}
          content={config}
          data={items}
          community={props.community}
        />
      ) : null}
      {hasOwnerRecords ? (
        <OwnerRecordsSummary blockId={props.block.id} groups={recordGroups} />
      ) : null}
    </>
  );
}
