import type { CommunityType } from '@propertypro/shared';

export type TemplateLifecycleState =
  | 'draft_only'
  | 'published_current'
  | 'published_with_unpublished_changes';

export interface PublicSiteTemplateThumbnailDescriptor {
  gradient: [string, string];
  layout: string;
}

export interface PublicSiteTemplatePublishedSnapshot {
  name: string;
  summary: string;
  tags: string[];
  thumbnailDescriptor: PublicSiteTemplateThumbnailDescriptor;
  communityType: CommunityType;
  jsxSource: string;
  compiledHtml: string;
  compiledAt: string;
}

export interface PublicSiteTemplateRow {
  id: number;
  slug: string;
  community_type: CommunityType;
  sort_order: number;
  name: string;
  summary: string;
  tags: string[];
  thumbnail_descriptor: PublicSiteTemplateThumbnailDescriptor;
  draft_jsx_source: string;
  published_snapshot: PublicSiteTemplatePublishedSnapshot | null;
  version: number;
  published_payload_hash: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TemplatePreviewDiagnostic {
  stage: 'compile' | 'runtime';
  message: string;
  line?: number;
  column?: number;
  excerpt?: string;
}

export interface PublicSiteTemplateEditorInput {
  name: string;
  summary: string;
  tags: string[];
  thumbnailDescriptor: PublicSiteTemplateThumbnailDescriptor;
  communityType: CommunityType;
  draftJsxSource: string;
}

export interface PublicSiteTemplateListItem {
  id: number;
  slug: string;
  communityType: CommunityType;
  sortOrder: number;
  name: string;
  summary: string;
  tags: string[];
  thumbnailDescriptor: PublicSiteTemplateThumbnailDescriptor;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  usageCount: number;
  lifecycleState: TemplateLifecycleState;
  hasUnpublishedChanges: boolean;
}

export interface PublicSiteTemplateDetail extends PublicSiteTemplateListItem {
  draftJsxSource: string;
  publishedSnapshot: PublicSiteTemplatePublishedSnapshot | null;
  canEditCommunityType: boolean;
}

export interface PublicSiteTemplatePreviewResponse {
  html?: string;
  errors?: TemplatePreviewDiagnostic[];
  compiledAt: string;
}

export type PublicSiteTemplateLifecycleState = TemplateLifecycleState;
export type PublicSiteTemplateEditorData = PublicSiteTemplateDetail;
export type TemplatePreviewResult = PublicSiteTemplatePreviewResponse;
