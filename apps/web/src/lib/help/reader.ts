/**
 * The help reader: who is reading, and which community type's help they see.
 *
 * Every reader-facing help surface (pages, APIs, modal) resolves one of these
 * and filters through `isArticleVisibleToReader` in help-article-service, so
 * section, community type, feature gates and drafts are applied the same way
 * everywhere.
 */
import {
  getFeaturesForCommunity,
  hasBoardDesignation,
  type CommunityFeatures,
  type CommunityType,
} from '@propertypro/shared';
import {
  resolveHelpCommunityType,
  resolveHelpSection,
  type HelpSection,
} from '@/lib/help/sections';
import { resolveHelpViewerTokens, type HelpViewerMembership } from '@/lib/help/viewer-role';

export interface HelpReader {
  section: HelpSection;
  /** The community type whose help is shown (own type, or a preview). */
  communityType: CommunityType;
  /** The reader's own community type. Differs from `communityType` while previewing. */
  ownCommunityType: CommunityType;
  /**
   * Features of `communityType`, for `featureGates`. Null when they could not
   * be resolved: gates then fail open (ADR-004) rather than emptying help.
   */
  features: CommunityFeatures | null;
  /** Holds a board seat: reads the resident section's `boardOnly` articles. */
  boardSeat: boolean;
}

export interface HelpReaderMembership extends HelpViewerMembership {
  communityType: CommunityType;
}

export function resolveHelpReader(
  membership: HelpReaderMembership,
  requestedType?: string | null,
  options?: { onFeatureError?: (error: unknown) => void },
): HelpReader {
  const section = resolveHelpSection(resolveHelpViewerTokens(membership));
  const communityType = resolveHelpCommunityType(section, membership.communityType, requestedType);
  let features: CommunityFeatures | null = null;
  try {
    features = getFeaturesForCommunity(communityType) ?? null;
  } catch (error) {
    options?.onFeatureError?.(error);
  }
  return {
    section,
    communityType,
    ownCommunityType: membership.communityType,
    features,
    boardSeat: hasBoardDesignation(membership.designation),
  };
}

export function isPreviewingType(reader: HelpReader): boolean {
  return reader.communityType !== reader.ownCommunityType;
}

/** Query string that keeps the reader's community and any type preview. */
export function helpQuery(communityId: number, reader: HelpReader): string {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (isPreviewingType(reader)) params.set('type', reader.communityType);
  return params.toString();
}
