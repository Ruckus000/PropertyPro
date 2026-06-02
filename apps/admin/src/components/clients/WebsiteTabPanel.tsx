'use client';

/**
 * Website Tab Panel — community website editor surface in apps/admin.
 *
 * PR #9b — the legacy "Page Template" sub-tab (JsxTemplateEditor) was
 * retired. Community sites now render through the block-model layout
 * registry maintained by the PM editor at /pm/settings/website. The
 * single remaining surface here is the branding controls.
 *
 * The sub-tab navigation chrome was dropped along with the template
 * tab; this panel now just renders CommunityWebsiteEditor directly.
 */
import { CommunityWebsiteEditor } from './CommunityWebsiteEditor';

interface WebsiteTabPanelProps {
  communityId: number;
  communitySlug: string;
  customDomain: string | null;
}

export function WebsiteTabPanel({ communityId, communitySlug, customDomain }: WebsiteTabPanelProps) {
  return (
    <CommunityWebsiteEditor
      communityId={communityId}
      communitySlug={communitySlug}
      customDomain={customDomain}
    />
  );
}
