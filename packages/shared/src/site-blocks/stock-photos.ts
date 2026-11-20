/**
 * Stock hero photos: scenery a look can show before a community has uploaded
 * its own.
 *
 * They are files in the web app's `public/site-looks/` folder, served from
 * there, and are NOT copied into each community's storage bucket. That is why a
 * stock hero photo carries an id and no `path`: storage paths must match
 * `^\d+/(logo|hero|content)/`, and copying the files per community would add
 * quota accounting for nothing.
 *
 * The library is thirteen photos, each in three widths (480, 1200 and 2400).
 * Two older photos, `sunset` and `palms`, are RETIRED: no look suggests them
 * and the picker does not offer them, but they stay in the id list, with their
 * single file and their description, because saved websites may still name them
 * and a stored id that stopped validating would break that community's site.
 *
 * Each library photo records its Unsplash page and image id, so the build
 * script can fetch it again and the credits file can be checked against it.
 */

export const STOCK_PHOTO_IDS = [
  'pilings-dusk',
  'gulf-sunset',
  'shoreline',
  'oak-avenue',
  'lake-reflection',
  'royal-palms',
  'palm-walk',
  'sea-oats',
  'palm-sky',
  'marsh-sunset',
  'dune-sunset',
  'mangrove-boardwalk',
  'sailboats',
  'sunset',
  'palms',
] as const;

export type StockPhotoId = (typeof STOCK_PHOTO_IDS)[number];

export interface StockPhotoEntry {
  /** What the picker shows. */
  name: string;
  /** The description a hero starts with when it shows this photo. */
  alt: string;
  /** Kept so stored websites still validate; not offered and not suggested. */
  retired: boolean;
  /** Where the photo came from. Null only for the two retired photos. */
  source: { page: string; imageId: string } | null;
}

const unsplash = (page: string, imageId: string) => ({
  page: `https://unsplash.com/photos/${page}`,
  imageId,
});

/**
 * One record per photo. The `alt` text is the description a hero starts with:
 * a look gives its hero this text, and the editor puts it on a photo when the
 * manager swaps one stock photo for another, so a photo never keeps another's
 * description. A manager may reword it afterwards.
 */
export const STOCK_PHOTOS: Readonly<Record<StockPhotoId, StockPhotoEntry>> = {
  'pilings-dusk': {
    name: 'Pilings at dusk',
    alt: 'Old dock pilings in the bay at sunset, sailboats on the horizon',
    retired: false,
    source: unsplash('M5fmqx88VcY', 'photo-1628651102070-2df2c7d93f51'),
  },
  'gulf-sunset': {
    name: 'Gulf sunset',
    alt: 'The sun setting over calm open water',
    retired: false,
    source: unsplash('sLUwiXCRHJU', 'photo-1515169697243-2d43bcd586f6'),
  },
  shoreline: {
    name: 'Morning shoreline',
    alt: 'Gentle waves on a beach under a pastel morning sky',
    retired: false,
    source: unsplash('XPeTOMKP8TE', 'photo-1608643886078-ccd9c7ebcca3'),
  },
  'oak-avenue': {
    name: 'Live oak avenue',
    alt: 'A lane under live oaks hung with Spanish moss',
    retired: false,
    source: unsplash('gCz68Y5kEuM', 'photo-1782011042799-8028dd02ef54'),
  },
  'lake-reflection': {
    name: 'Lake reflection',
    alt: 'Trees and clouds reflected in a still lake',
    retired: false,
    source: unsplash('mD_Q_sGubDU', 'photo-1669858692515-1a52a9f365d1'),
  },
  'royal-palms': {
    name: 'Royal palms',
    alt: 'Royal palm trees seen from below against a clear blue sky',
    retired: false,
    source: unsplash('naSE7F3bIvs', 'photo-1760324457092-fde98cc87cda'),
  },
  'palm-walk': {
    name: 'Palm walk',
    alt: 'A grassy path between rows of palm trees',
    retired: false,
    source: unsplash('FU7EJKjo2os', 'photo-1625698939138-a064465b1931'),
  },
  'sea-oats': {
    name: 'Sea oats',
    alt: 'Sea oats on a white sand dune under a blue sky',
    retired: false,
    source: unsplash('g1-nbV4vVY0', 'photo-1775191232786-5886de72de70'),
  },
  'palm-sky': {
    name: 'Palms against the sky',
    alt: 'A row of tall palm trees against a soft evening sky',
    retired: false,
    source: unsplash('HMgrM8ubOGY', 'photo-1666310254863-d231c6ba5b4e'),
  },
  'marsh-sunset': {
    name: 'Marsh at sundown',
    alt: 'The sun setting over a marsh, reflected in still water',
    retired: false,
    source: unsplash('TyVPvSuzkfU', 'photo-1662427580294-9c3a2b8725ec'),
  },
  'dune-sunset': {
    name: 'Dune at sunset',
    alt: 'Sea oats silhouetted against an orange sunset',
    retired: false,
    source: unsplash('2xO9UwSWzHI', 'photo-1759499368675-b9997dbaa558'),
  },
  'mangrove-boardwalk': {
    name: 'Mangrove boardwalk',
    alt: 'A wooden boardwalk beside a mangrove-lined river',
    retired: false,
    source: unsplash('fSCfNl0cdw0', 'photo-1779721464169-f99845792b9b'),
  },
  sailboats: {
    name: 'Sailboats at anchor',
    alt: 'Two sailboats at anchor on calm water near a wooded shore',
    retired: false,
    source: unsplash('em6exGT4o50', 'photo-1777823832189-d450542369fb'),
  },
  sunset: {
    name: 'Sunset over the water',
    alt: 'Sunset over the water, with palm trees in silhouette',
    retired: true,
    source: null,
  },
  palms: {
    name: 'Palm-lined street',
    alt: 'A quiet street lined with tall palm trees',
    retired: true,
    source: null,
  },
};

/** The photos the picker offers: every non-retired id, in library order. */
export const PICKABLE_STOCK_PHOTO_IDS: readonly StockPhotoId[] = STOCK_PHOTO_IDS.filter(
  (id) => !STOCK_PHOTOS[id].retired,
);

/** The widths each library photo is served in. */
export type StockPhotoWidth = 480 | 1200 | 2400;

/**
 * Where a stock photo is served from, as a path under the web app's `public/`
 * folder. A retired photo has one file, so it is the same at every width.
 */
export function stockPhotoSrc(id: StockPhotoId, width: StockPhotoWidth): string {
  return STOCK_PHOTOS[id].retired ? `/site-looks/${id}.webp` : `/site-looks/${id}.${width}.webp`;
}

/** The full-size file for each id (the 2400 wide one for a library photo). */
export const STOCK_PHOTO_SRC: Readonly<Record<StockPhotoId, string>> = Object.fromEntries(
  STOCK_PHOTO_IDS.map((id) => [id, stockPhotoSrc(id, 2400)]),
) as Record<StockPhotoId, string>;

/** What each stock photo shows, as the description a hero starts with. */
export const STOCK_PHOTO_ALT: Readonly<Record<StockPhotoId, string>> = Object.fromEntries(
  STOCK_PHOTO_IDS.map((id) => [id, STOCK_PHOTOS[id].alt]),
) as Record<StockPhotoId, string>;

/**
 * A hero photo that is one of ours: an id and a description, never a path.
 * Tell it apart from an uploaded photo with `'stock' in photo`.
 */
export type StockHeroPhoto = { stock: StockPhotoId; alt: string };
