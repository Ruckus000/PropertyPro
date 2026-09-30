/**
 * Raw PDF 1.4 generation for violation notices and hearing notices.
 * Zero third-party dependencies — follows the same pattern as finance-pdf.ts.
 */

import { formatCents } from '@propertypro/shared';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54; // 0.75 inch margins
const START_Y = 720;
const LINE_HEIGHT = 14;
const HEADING_LINE_HEIGHT = 20;
const MAX_LINES_PER_PAGE = 44;

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * The fonts declare `/WinAnsiEncoding` and the file is emitted one byte per
 * character, so text must be reduced to that code page. Until 2026-09-30 it was
 * written as UTF-8: the template's own em dash and apostrophes, and any accent
 * or smart quote an association typed, rendered as junk, and every such
 * character put `/Length` and the xref offsets 2 bytes out.
 */
// cp1252 0x80-0x9F: the WinAnsi glyphs that are not at their Unicode code point.
const WIN_ANSI_EXTRAS: Record<string, string> = Object.fromEntries(
  [...'\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178']
    .map((ch, i) => [ch, String.fromCharCode([0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f][i]!)]),
);

function toWinAnsi(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    // U+0080-U+009F are C1 controls, not glyphs; passed through they would
    // print as the WinAnsi glyph at that byte (U+0080 as a euro sign).
    const latin1 = code <= 0xff && (code < 0x80 || code > 0x9f);
    out += latin1 ? ch : WIN_ANSI_EXTRAS[ch] ?? '?';
  }
  return out;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Date-only strings (`YYYY-MM-DD`) are calendar dates and format in UTC, where
 * they parse. Timestamps format in the community's time zone: in UTC, a hearing
 * at 8:30pm Eastern printed as the next day.
 */
function formatDate(
  date: Date | string | null | undefined,
  timeZone: string,
  withTime = false,
): string {
  if (!date) return 'N/A';
  const dateOnly = typeof date === 'string' && isDateOnly(date);
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime && !dateOnly ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: dateOnly ? 'UTC' : timeZone,
  });
}

/**
 * A word longer than this is split. Measured in characters, not width, so it
 * is sized for the WIDEST Helvetica glyph (W, 0.944 em): 50 at 10pt is 472pt,
 * inside the 504pt text column. Ordinary prose wraps at 80 on spaces.
 */
const MAX_WORD_CHARS = 50;

function wrapText(text: string, maxCharsPerLine: number): string[] {
  // `u`: count code points, so a split never lands inside a surrogate pair.
  const words = text
    .split(/\s+/)
    .flatMap((word) => word.match(new RegExp(`.{1,${MAX_WORD_CHARS}}`, 'gu')) ?? []);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ------------------------------------------------------------------
// Shared PDF builder
// ------------------------------------------------------------------

interface PdfLine {
  text: string;
  fontSize?: number;
  bold?: boolean;
  lineHeight?: number;
}

function chunkLines(lines: PdfLine[]): PdfLine[][] {
  const chunks: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let count = 0;
  for (const line of lines) {
    current.push(line);
    count++;
    if (count >= MAX_LINES_PER_PAGE) {
      chunks.push(current);
      current = [];
      count = 0;
    }
  }
  if (current.length > 0 || chunks.length === 0) {
    chunks.push(current);
  }
  return chunks;
}

function buildPageContent(lines: PdfLine[]): string {
  let y = START_Y;
  const ops: string[] = ['BT'];
  for (const line of lines) {
    const fontSize = line.fontSize ?? 10;
    const fontKey = line.bold ? '/F2' : '/F1';
    const lh = line.lineHeight ?? LINE_HEIGHT;
    ops.push(`${fontKey} ${fontSize} Tf`);
    // `Tm` sets an ABSOLUTE position. `Td` is relative to the previous line,
    // so `x y Td` with absolute coordinates put every line after the first
    // off the page: until 2026-09-30 both notices showed only the DRAFT banner.
    ops.push(`1 0 0 1 ${MARGIN_X} ${y} Tm (${escapePdfText(toWinAnsi(line.text))}) Tj`);
    y -= lh;
  }
  ops.push('ET');
  return ops.join('\n');
}

function buildPdf(lines: PdfLine[]): Uint8Array {
  const pages = chunkLines(lines);
  const objectBodies: string[] = [];
  const xref: number[] = [0];
  let pdf = '%PDF-1.4\n';

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const boldFontId = 4;
  let nextId = 5;
  const pageIds: number[] = [];

  objectBodies.push(
    `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`,
  );
  objectBodies.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );
  objectBodies.push(
    `${boldFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );

  const pageObjects: string[] = [];
  for (const pageLines of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);

    const stream = buildPageContent(pageLines);
    pageObjects.push(
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
  }

  objectBodies.splice(
    1,
    0,
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`,
  );
  objectBodies.push(...pageObjects);

  for (const body of objectBodies) {
    xref.push(pdf.length);
    pdf += body;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${xref.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < xref.length; i++) {
    pdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${xref.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  // One byte per character (every char is <= 0xFF after toWinAnsi), so the
  // string lengths used for `/Length` and the xref ARE byte offsets.
  return Uint8Array.from(pdf, (ch) => ch.charCodeAt(0));
}

// ------------------------------------------------------------------
// Violation Notice PDF
// ------------------------------------------------------------------

export interface ViolationNoticePayload {
  violationId: number;
  communityName: string;
  communityAddress: string;
  unitNumber: string;
  ownerName: string | null;
  category: string;
  description: string;
  severity: string;
  reportedDate: Date | string;
  noticeDate: string;
  curePeriodDays?: number;
  hearingDate?: Date | string | null;
  fineSchedule?: string | null;
  /** The community's IANA time zone (`resolveTimezone(communities.timezone)`). */
  timeZone: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  noise: 'Noise',
  parking: 'Parking',
  unauthorized_modification: 'Unauthorized Modification',
  pet: 'Pet Violation',
  trash: 'Trash / Debris',
  common_area_misuse: 'Common Area Misuse',
  landscaping: 'Landscaping',
  property_damage: 'Property Damage',
  other: 'Other',
};

/**
 * The DRAFT banner every generated notice opens with.
 *
 * ── Why a watermark rather than better wording ──
 *
 * This document addresses an owner by name, cites statutes, asserts that a
 * violation has occurred, and enumerates the recipient's legal rights. Produced
 * by software and handed to a board to send unreviewed, that is the sharpest
 * unauthorized-practice-of-law edge in the product. Marking it DRAFT does not
 * make the content correct — it makes the document's status unambiguous, so
 * what reaches an owner is something the association adopted rather than
 * something a vendor generated.
 *
 * It is first on the page, before the community name, on purpose: a reader who
 * sees only the top of the page must see it.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-05.
 */
function pushDraftBanner(lines: PdfLine[]): void {
  lines.push({
    text: 'DRAFT — FOR REVIEW BY THE ASSOCIATION AND ITS COUNSEL',
    fontSize: 14,
    bold: true,
    lineHeight: HEADING_LINE_HEIGHT,
  });
  lines.push({
    text: 'This document was generated by software from data the association entered.',
  });
  lines.push({
    text: 'It has not been reviewed by an attorney. Confirm its accuracy and legal',
  });
  lines.push({
    text: 'sufficiency before delivering it to any owner or resident.',
  });
  lines.push({ text: '' });
}

/** Closing disclaimer. Repeated at the foot for the same reason as the banner. */
function pushGeneratedDisclaimer(lines: PdfLine[]): void {
  lines.push({ text: '' });
  lines.push({
    text: 'Generated by PropertyPro from association-entered data. PropertyPro is not',
  });
  lines.push({
    text: 'a law firm and does not provide legal advice. The association is responsible',
  });
  lines.push({ text: 'for the content and delivery of this notice.' });
}

export function generateViolationNoticePdf(payload: ViolationNoticePayload): Uint8Array {
  const cureDays = payload.curePeriodDays ?? 14;
  const lines: PdfLine[] = [];

  pushDraftBanner(lines);

  // Header
  lines.push({ text: payload.communityName, fontSize: 14, bold: true, lineHeight: HEADING_LINE_HEIGHT });
  lines.push({ text: payload.communityAddress });
  lines.push({ text: '' });

  // Title
  lines.push({ text: 'NOTICE OF VIOLATION', fontSize: 14, bold: true, lineHeight: HEADING_LINE_HEIGHT });
  lines.push({ text: '' });

  // Date and addressee
  lines.push({ text: `Date: ${payload.noticeDate}` });
  lines.push({ text: '' });
  lines.push({ text: `To: ${payload.ownerName ?? 'Unit Owner/Resident'}` });
  lines.push({ text: `Unit: ${payload.unitNumber}` });
  lines.push({ text: '' });

  // Violation details
  lines.push({ text: `Violation ID: #${payload.violationId}` });
  lines.push({ text: `Category: ${CATEGORY_LABELS[payload.category] ?? payload.category}` });
  lines.push({ text: `Severity: ${payload.severity.charAt(0).toUpperCase() + payload.severity.slice(1)}` });
  lines.push({ text: `Date Reported: ${formatDate(payload.reportedDate, payload.timeZone)}` });
  lines.push({ text: '' });

  // Description
  lines.push({ text: 'Description of Violation:', bold: true });
  const descLines = wrapText(payload.description, 80);
  for (const dl of descLines) {
    lines.push({ text: dl });
  }
  lines.push({ text: '' });

  // Cure period
  lines.push({ text: 'Required Action:', bold: true });
  lines.push({
    text: `You are hereby notified that the above violation must be corrected within ${cureDays} days`,
  });
  lines.push({
    text: `of the date of this notice (by ${formatDate(addDays(payload.noticeDate, cureDays), payload.timeZone)}).`,
  });
  lines.push({ text: '' });

  // Hearing info
  if (payload.hearingDate) {
    lines.push({ text: 'Hearing Information:', bold: true });
    lines.push({
      text: `A hearing has been scheduled for ${formatDate(payload.hearingDate, payload.timeZone, true)}.`,
    });
    lines.push({
      text: 'You have the right to attend the hearing and present evidence in your defense.',
    });
    lines.push({ text: '' });
  }

  // Fine schedule
  if (payload.fineSchedule) {
    lines.push({ text: 'Fine Schedule:', bold: true });
    const fineLines = wrapText(payload.fineSchedule, 80);
    for (const fl of fineLines) {
      lines.push({ text: fl });
    }
    lines.push({ text: '' });
  }

  // Legal reference
  lines.push({ text: 'Legal Authority:', bold: true });
  lines.push({
    text: 'This notice is issued pursuant to the governing documents of the association',
  });
  lines.push({
    text: 'and applicable provisions of the Florida Condominium Act (F.S. Chapter 718)',
  });
  lines.push({
    text: 'and/or the Florida Homeowners Association Act (F.S. Chapter 720).',
  });
  lines.push({ text: '' });

  // Rights.
  //
  // Softened from an enumeration of what the recipient's rights ARE to a
  // pointer at where they are defined. The previous text told an owner, in the
  // association's voice but in PropertyPro's words, what Florida law entitles
  // them to — which is legal advice about the reader's own position, and wrong
  // in any association whose documents provide something different.
  lines.push({ text: 'Your Rights:', bold: true });
  lines.push({
    text: 'The association\u2019s governing documents and Florida law provide procedures',
  });
  lines.push({
    text: 'for responding to this notice, which may include requesting a hearing.',
  });
  lines.push({
    text: 'Refer to your governing documents, or consult an attorney, to determine',
  });
  lines.push({ text: 'what applies to you.' });
  lines.push({ text: '' });
  lines.push({ text: '' });

  // Signature block — left for the association to complete. Software must not
  // sign a notice on the board's behalf.
  lines.push({ text: 'Authorized representative: ______________________________' });
  lines.push({ text: payload.communityName });

  pushGeneratedDisclaimer(lines);

  return buildPdf(lines);
}

// ------------------------------------------------------------------
// Hearing Notice PDF
// ------------------------------------------------------------------

export interface HearingNoticePayload {
  violationId: number;
  communityName: string;
  communityAddress: string;
  unitNumber: string;
  ownerName: string | null;
  category: string;
  description: string;
  hearingDate: Date | string;
  hearingLocation: string | null;
  noticeDate: string;
  /**
   * The community's EFFECTIVE fine caps (`membership.fineCaps`, from
   * `resolveFineCaps`) — the same numbers the fine service enforces. Required
   * so the notice can never state a cap the association does not apply.
   */
  fineCaps: { perFineCents: number; aggregateCents: number };
  /** The community's IANA time zone (`resolveTimezone(communities.timezone)`). */
  timeZone: string;
}

export function generateHearingNoticePdf(payload: HearingNoticePayload): Uint8Array {
  const lines: PdfLine[] = [];

  pushDraftBanner(lines);

  // Header
  lines.push({ text: payload.communityName, fontSize: 14, bold: true, lineHeight: HEADING_LINE_HEIGHT });
  lines.push({ text: payload.communityAddress });
  lines.push({ text: '' });

  // Title
  lines.push({ text: 'NOTICE OF HEARING', fontSize: 14, bold: true, lineHeight: HEADING_LINE_HEIGHT });
  lines.push({ text: '' });

  // Date and addressee
  lines.push({ text: `Date: ${payload.noticeDate}` });
  lines.push({ text: '' });
  lines.push({ text: `To: ${payload.ownerName ?? 'Unit Owner/Resident'}` });
  lines.push({ text: `Unit: ${payload.unitNumber}` });
  lines.push({ text: '' });

  // Reference
  lines.push({ text: `Re: Violation #${payload.violationId} - ${CATEGORY_LABELS[payload.category] ?? payload.category}` });
  lines.push({ text: '' });

  // Hearing details
  lines.push({ text: 'Hearing Details:', bold: true });
  lines.push({ text: `Date and Time: ${formatDate(payload.hearingDate, payload.timeZone, true)}` });
  if (payload.hearingLocation) {
    lines.push({ text: `Location: ${payload.hearingLocation}` });
  }
  lines.push({ text: '' });

  // Description reminder
  lines.push({ text: 'Violation Description:', bold: true });
  const descLines = wrapText(payload.description, 80);
  for (const dl of descLines) {
    lines.push({ text: dl });
  }
  lines.push({ text: '' });

  // 14-day advance notice: calendar days from the notice date to the hearing's
  // date IN THE COMMUNITY. Measured in UTC, a hearing at 8:30pm Eastern on
  // day 13 counted as 14 and suppressed the short-notice warning below.
  const hearingDateObj = typeof payload.hearingDate === 'string'
    ? new Date(payload.hearingDate)
    : payload.hearingDate;
  const hearingLocalDate = typeof payload.hearingDate === 'string' && isDateOnly(payload.hearingDate)
    ? payload.hearingDate
    : utcDateToWallClockValue(hearingDateObj, payload.timeZone).slice(0, 10);
  const daysBetween = Math.round(
    (Date.parse(`${hearingLocalDate}T00:00:00Z`) - Date.parse(`${payload.noticeDate}T00:00:00Z`))
      / (1000 * 60 * 60 * 24),
  );

  // A MEASUREMENT, not a compliance conclusion.
  //
  // The old text said a notice "is in compliance with the required 14-day
  // advance notice period" — the software certifying the association's
  // statutory compliance, which is precisely the claim
  // `.claude/rules/florida-compliance.md` forbids and which is wrong wherever
  // the governing documents require more. It now states the interval and lets
  // the reader draw the conclusion. The short-notice case stays prominent,
  // because a board about to send an inadequate notice needs to see it.
  lines.push({
    text: `This notice is dated ${daysBetween} days before the scheduled hearing.`,
  });
  if (daysBetween < 14) {
    lines.push({
      text: 'NOTE: This is fewer than 14 days. Most governing documents and',
      bold: true,
    });
    lines.push({
      text: 'Florida law contemplate a longer period. Verify before sending.',
      bold: true,
    });
  }
  lines.push({ text: '' });

  // Hearing procedure — a pointer, not an enumeration.
  //
  // This used to list four "rights" as fact, including a continuance the
  // governing documents may not provide. Telling an owner what the law entitles
  // them to is advice about their own position (legal-risk audit F-05), so the
  // hearing notice now points at the governing documents exactly as the
  // violation notice's rights section does.
  lines.push({ text: 'Hearing Procedure:', bold: true });
  lines.push({
    text: 'The association\u2019s governing documents and Florida law set out how',
  });
  lines.push({
    text: 'this hearing is conducted and what you may do at it. Refer to your',
  });
  lines.push({
    text: 'governing documents, or consult an attorney, to determine what applies.',
  });
  lines.push({ text: '' });

  // Consequences.
  //
  // §718.303(3) / §720.305(2): a fine may not be imposed by the board. It
  // requires the approval of a committee of members who are neither officers,
  // directors, nor their relatives. The old text named the Board as the body
  // that imposes the fine, which contradicted the same document's own citation
  // of those sections two lines below.
  lines.push({ text: 'Possible Outcomes:', bold: true });
  lines.push({ text: 'After considering the evidence presented, the association may:' });
  lines.push({ text: '- Dismiss the violation' });
  // The caps are the community's effective ones, not a hardcoded $100/$1,000:
  // communities whose documents authorize more carry an override, and the fine
  // service enforces that override — the notice must state the same numbers.
  lines.push({ text: '- Impose a fine, subject to approval by a committee of members who are' });
  lines.push({ text: '  not officers, directors, or their relatives (F.S. 718.303 / 720.305),' });
  lines.push({
    text: `  within the association's fine limits of ${formatCents(payload.fineCaps.perFineCents)} per violation`,
  });
  lines.push({
    text: `  and ${formatCents(payload.fineCaps.aggregateCents)} in aggregate`,
  });
  lines.push({ text: '- Require corrective action within a specified timeframe' });
  lines.push({ text: '- Take other action as permitted by the governing documents' });
  lines.push({ text: '' });

  // Failure to appear
  lines.push({ text: 'Failure to Appear:', bold: true });
  lines.push({
    text: 'If you do not attend, the hearing may proceed in your absence.',
  });
  lines.push({ text: '' });
  lines.push({ text: '' });

  // Signature block — see the violation notice.
  lines.push({ text: 'Authorized representative: ______________________________' });
  lines.push({ text: payload.communityName });

  pushGeneratedDisclaimer(lines);

  return buildPdf(lines);
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Date-only arithmetic in UTC; the result is formatted as a calendar date. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
