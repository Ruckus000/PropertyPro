/**
 * Block schema registry — single source of truth mapping BlockType to its
 * Zod content schema. Used at:
 *   - read time: validate block.content before render (skip + Sentry on fail)
 *   - write time: validate PM-submitted block content at the editor API
 *   - test time: registry-completeness assertion
 */
import type { z } from 'zod';
import { BLOCK_TYPES, type BlockType } from './types';
import { heroBlockSchema } from './hero';
import { textBlockSchema } from './text';
import { imageBlockSchema } from './image';
import { documentsBlockSchema } from './documents';
import { meetingsBlockSchema } from './meetings';
import { announcementsBlockSchema } from './announcements';
import { contactBlockSchema } from './contact';
import { faqBlockSchema } from './faq';
import { galleryBlockSchema } from './gallery';
import { amenitiesBlockSchema } from './amenities';
import { paymentsBlockSchema } from './payments';

export const blockSchemaRegistry = {
  hero: heroBlockSchema,
  text: textBlockSchema,
  image: imageBlockSchema,
  documents: documentsBlockSchema,
  meetings: meetingsBlockSchema,
  announcements: announcementsBlockSchema,
  contact: contactBlockSchema,
  faq: faqBlockSchema,
  gallery: galleryBlockSchema,
  amenities: amenitiesBlockSchema,
  payments: paymentsBlockSchema,
} satisfies Record<BlockType, z.ZodType>;

export {
  BLOCK_TYPES,
  blockTypeSchema,
  TOMBSTONE_BLOCK_TYPE,
  BLOCK_VARIANTS,
  blockVariantSchema,
  emptyTextSchema,
} from './types';
export type { BlockType, BlockVariant } from './types';
export {
  heroBlockSchema,
  heroPhotoSchema,
  MAX_HERO_PHOTOS,
  type HeroBlockContent,
  type HeroPhoto,
} from './hero';
export {
  resolveHeroPhotos,
  stripVariantSuffix,
  type ResolvedHeroPhoto,
} from './hero-photos';
export { textBlockSchema, type TextBlockContent } from './text';
export { imageBlockSchema, type ImageBlockContent } from './image';
export { documentsBlockSchema, DOCUMENT_CATEGORIES, type DocumentsBlockContent, type DocumentCategory } from './documents';
export { meetingsBlockSchema, type MeetingsBlockContent } from './meetings';
export { announcementsBlockSchema, type AnnouncementsBlockContent } from './announcements';
export { contactBlockSchema, type ContactBlockContent } from './contact';
export { faqBlockSchema, faqItemSchema, type FaqBlockContent, type FaqItem } from './faq';
export {
  galleryBlockSchema,
  galleryImageSchema,
  type GalleryBlockContent,
  type GalleryImage,
} from './gallery';
export { paymentsBlockSchema, type PaymentsBlockContent } from './payments';
export {
  amenitiesBlockSchema,
  amenityItemSchema,
  type AmenitiesBlockContent,
  type AmenityItem,
} from './amenities';
export {
  starterPackBlockSchema,
  starterPackBlocksSchema,
  validateStarterPackBlocks,
  type StarterPackBlock,
  type StarterPackFieldError,
  type ValidateStarterPackBlocksResult,
} from './starter-pack';
