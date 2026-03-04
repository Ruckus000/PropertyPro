import type { CommunityTheme } from '@propertypro/theme';
import type { BlockType } from '@propertypro/shared';
import { HeroBlock } from './HeroBlock';
import { AnnouncementsBlock } from './AnnouncementsBlock';
import { DocumentsBlock } from './DocumentsBlock';
import { MeetingsBlock } from './MeetingsBlock';
import { ContactBlock } from './ContactBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';

/**
 * Props shared by all block renderer components.
 */
export interface BlockRendererProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Component type for block renderers — supports both sync (client-renderable)
 * and async (server component) block renderers.
 */
type BlockRenderer = (props: BlockRendererProps) => React.ReactNode | Promise<React.ReactNode>;

/**
 * Registry mapping block type to its renderer component.
 * Server components (announcements, documents, meetings) are async.
 * Client-renderable components (hero, contact, text, image) are sync.
 */
export const BLOCK_RENDERERS: Record<BlockType, BlockRenderer> = {
  hero: HeroBlock,
  announcements: AnnouncementsBlock,
  documents: DocumentsBlock,
  meetings: MeetingsBlock,
  contact: ContactBlock,
  text: TextBlock,
  image: ImageBlock,
};

export {
  HeroBlock,
  AnnouncementsBlock,
  DocumentsBlock,
  MeetingsBlock,
  ContactBlock,
  TextBlock,
  ImageBlock,
};
