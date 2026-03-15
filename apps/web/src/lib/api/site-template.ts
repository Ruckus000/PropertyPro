/**
 * Fetch the published JSX template for a community's public site.
 *
 * Uses unscoped client because site_blocks is queried by community_id
 * (the root tenant key) in a public-facing context where no session exists.
 */
import { siteBlocks } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { eq, and, isNull } from '@propertypro/db/filters';

/**
 * Returns the compiled HTML of the published jsx_template block for a community,
 * or null if no template has been published.
 */
export async function getPublishedTemplate(
  communityId: number,
): Promise<string | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ content: siteBlocks.content })
    .from(siteBlocks)
    .where(
      and(
        eq(siteBlocks.communityId, communityId),
        eq(siteBlocks.blockType, 'jsx_template'),
        eq(siteBlocks.isDraft, false),
        isNull(siteBlocks.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const content = row.content as { compiledHtml?: string } | null;
  return content?.compiledHtml ?? null;
}
