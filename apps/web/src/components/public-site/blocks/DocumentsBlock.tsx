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
 * Category note: the documentsBlockSchema includeCategories enum values
 * ('budget', 'minutes', 'financial', 'rules', 'other') are matched against
 * documentCategories.name (no slug column exists). Categories are the only
 * public-access control on documents in PR #4.
 */
import { documentsBlockSchema, type DocumentsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { DocumentsBlockView } from './DocumentsBlockView';
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
  const items = await reader.listDocuments({
    limit: config.limit,
    includeCategories: config.includeCategories,
  });

  return (
    <DocumentsBlockView
      blockId={props.block.id}
      content={config}
      data={items}
      community={props.community}
    />
  );
}
