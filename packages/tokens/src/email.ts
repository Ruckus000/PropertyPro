import { primitiveColors } from './primitives';

// Re-export primitives so email templates can reference one-off colors
// without needing a semantic token for every shade.
export { primitiveColors };

/**
 * "Florida Modern" email system (v4) — the palette the redesigned templates
 * paint with. Design source: claude.ai/design "Email Redesign - Florida Modern"
 * + "Platform Emails - Florida Modern".
 *
 * Warm sand surfaces, zinc ink, coral brand, and one semantic triplet per
 * state (accent rule / text / pill background / pill border). Every text pair
 * here clears 4.5:1 on the surface it is drawn on — `meta` (zinc-500) is the
 * floor and is only used at 11px+ on `card`/`masthead`.
 */
const ramp = primitiveColors;

export const emailTheme = {
  // Surfaces
  canvas:   ramp.sand[100],   // #F6EFE6 — page behind the card, footer band
  card:     ramp.sand[0],     // #FFFEFC
  masthead: ramp.sand[25],    // #FDFAF6 — masthead + data panels
  border:   ramp.sand[200],   // #EFE7DC

  // Ink
  ink:  ramp.zinc[900],       // #18181B — headlines, values
  body: ramp.zinc[700],       // #3F3F46 — paragraphs, footer
  meta: ramp.zinc[500],       // #71717A — labels, fine print
  onFill: ramp.sand[0],       // text on a filled button / band
  wordmark: '#231610',        // PropertyPro lockup ink (marketing-brand.tsx)

  // Brand
  coral:       ramp.coral[600], // #C2533A — rule, monogram, primary button
  link:        ramp.coral[700], // #A8412C — links + coral label text
  coralSubtle: ramp.coral[50],  // #FCF1ED — coral chip bg
  coralBorder: ramp.coral[100], // #F7DCD2 — coral chip border, link underline

  // Semantic states. `rule` is the 4px accent, `text` the label/button colour.
  amber:  { rule: ramp.amber[600], text: ramp.amber[700], bg: ramp.amber[50], border: ramp.amber[200], ink: ramp.yellow[800] },
  red:    { rule: ramp.red[700],   text: ramp.red[700],   bg: ramp.red[50],   border: ramp.red[200],   ink: ramp.red[900], inkSoft: '#991B1B' },
  green:  { rule: ramp.green[700], text: ramp.green[700], bg: ramp.green[50], border: ramp.green[200], ink: '#065F46' },
  teal:   { rule: ramp.teal[700],  text: ramp.teal[700],  bg: ramp.teal[50],  border: ramp.teal[200],  ink: ramp.teal[800] },
  violet: { rule: ramp.violet[700], text: ramp.violet[700], bg: ramp.violet[50], border: ramp.violet[200], ink: ramp.violet[900] },
  neutral:{ rule: ramp.zinc[500],  text: ramp.zinc[700],  bg: ramp.zinc[100], border: ramp.zinc[200],  ink: ramp.zinc[800] },
} as const;

export type EmailTone = 'coral' | 'amber' | 'red' | 'green' | 'teal' | 'violet' | 'neutral';
