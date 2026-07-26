/**
 * ContactBlock — SoR block for public management contact and board roster.
 *
 * Async server component: validates, fetches, and hands the result to the pure
 * view. The management section uses only communities.contact_* fields and the
 * board roster intentionally exposes names and public titles only — that
 * boundary is enforced by the reader. Markup lives in ContactBlockView so the
 * editor canvas renders the same thing; see BlockViewProps in ./types.
 */
import { contactBlockSchema, type ContactBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { ContactBlockView } from './ContactBlockView';
import type { BlockRendererProps } from './types';

export async function ContactBlock(props: BlockRendererProps) {
  const parsed = contactBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'contact block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }

  const config: ContactBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const contact = await reader.getContactInfo({
    showBoard: config.showBoard,
    showManagement: config.showManagement,
  });

  return (
    <ContactBlockView
      blockId={props.block.id}
      content={config}
      data={contact}
      community={props.community}
    />
  );
}
