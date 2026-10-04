import type { EditorMode } from '../tools';

/** The `data-tour` value on the element a step points at. */
export type TourAnchor = 'steps' | 'tools' | 'page' | 'publish';

export interface TourStep {
  anchor: TourAnchor;
  title: string;
  body: string;
}

/**
 * The editor's four-step tour (website builder v4, Phase 3), in the design's
 * order but in the product's words.
 *
 * Where the design's copy is wrong about this editor, it is not used:
 *  - "Click any words on the page and just type": the canvas has no on-page
 *    typing; a section's words are edited in its settings on the right.
 *  - "Nothing is live until you publish": Settings, a published page's name
 *    and menu place, and an urgent notice all go live on save.
 *  - "We check Florida's requirements before anything goes live": the checks
 *    are shown, and never stop a publish.
 *
 * `floridaRules` is false for apartments (no requirement level), whose tour
 * says nothing about Florida's website rules.
 */
export function tourSteps(mode: EditorMode, floridaRules: boolean): TourStep[] {
  const first: TourStep =
    mode === 'guided'
      ? {
          anchor: 'steps',
          title: 'Follow your next steps',
          body: floridaRules
            ? "This checklist walks you through setting up your site, one step at a time. Florida's requirements are at the top."
            : 'This checklist walks you through setting up your site, one step at a time.',
        }
      : {
          anchor: 'tools',
          title: 'Your tools live here',
          body: 'Add sections, manage pages, change the look, or post an urgent notice. Each is one click away.',
        };
  return [
    first,
    {
      anchor: 'page',
      title: 'Click a section to change it',
      body: 'Click a section to select it. Its settings open on the right, and your changes save as a draft on their own.',
    },
    {
      anchor: 'page',
      title: 'Add sections between others',
      body: 'Use “Add section here” between sections, or the button at the bottom of the page.',
    },
    {
      anchor: 'publish',
      title: 'Your page changes wait for Publish',
      body: floridaRules
        ? "When you're ready, press Publish. You'll see everything that changed, including any of Florida's requirements that need a look, before it goes live."
        : "When you're ready, press Publish. You'll see everything that changed before it goes live.",
    },
  ];
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 340;
const GAP = 16;
const MARGIN = 16;

/**
 * Where the tour card goes for an anchor: below a small one (a button), beside
 * a tall narrow one (right, then left: a panel or the rail), and otherwise
 * inside a large one (the page itself). Always kept on screen.
 */
export function placeCard(
  anchor: Box,
  viewport: { width: number; height: number },
  cardHeight: number,
): { top: number; left: number } {
  const clampLeft = (left: number) =>
    Math.min(Math.max(left, MARGIN), viewport.width - CARD_WIDTH - MARGIN);
  const clampTop = (top: number) =>
    Math.min(Math.max(top, MARGIN), viewport.height - cardHeight - MARGIN);

  if (anchor.height < viewport.height / 4) {
    // Right edges lined up, so a button at the right of the bar keeps its card on screen.
    return {
      top: clampTop(anchor.top + anchor.height + GAP),
      left: clampLeft(anchor.left + anchor.width - CARD_WIDTH),
    };
  }
  if (anchor.width < viewport.width / 2) {
    const right = anchor.left + anchor.width + GAP;
    if (right + CARD_WIDTH + MARGIN <= viewport.width) {
      return { top: clampTop(anchor.top + GAP), left: right };
    }
    const left = anchor.left - GAP - CARD_WIDTH;
    if (left >= MARGIN) return { top: clampTop(anchor.top + GAP), left };
  }
  return {
    top: clampTop(anchor.top + 4 * GAP),
    left: clampLeft(anchor.left + anchor.width / 2 - CARD_WIDTH / 2),
  };
}

export const TOUR_CARD_WIDTH = CARD_WIDTH;
