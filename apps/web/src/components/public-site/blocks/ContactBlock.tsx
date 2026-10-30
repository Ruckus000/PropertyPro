/**
 * ContactBlock — SoR block for the association's public contact details: the
 * management contact, the office address and hours from the Community profile,
 * and the board roster.
 *
 * Async server component: validates, fetches, and hands the result to the pure
 * view. The management section uses only communities.contact_* fields and the
 * board roster intentionally exposes names and public titles only — that
 * boundary is enforced by the reader. Markup lives in ContactBlockView so the
 * editor canvas renders the same thing; see BlockViewProps in ./types.
 *
 * With nothing to show (no address, no hours, no management details while the
 * management toggle is on, and no board while the board toggle is on) it renders
 * nothing: the live site never shows an empty box (D14). A board with no other
 * details still renders. The view keeps its placeholder text, because the editor
 * canvas renders the view directly and a manager needs to see the empty section.
 */
import { contactBlockSchema, type ContactBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { ContactBlockView, contactHasContent } from './ContactBlockView';
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
  if (!contactHasContent(contact)) return null;

  return (
    <ContactBlockView
      blockId={props.block.id}
      content={config}
      data={contact}
      community={props.community}
      anchorId={props.anchorId}
    />
  );
}
