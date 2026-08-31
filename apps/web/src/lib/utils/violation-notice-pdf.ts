/**
 * Raw PDF 1.4 generation for violation notices and hearing notices.
 * Zero external dependencies — follows the same pattern as finance-pdf.ts.
 */

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

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
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
    ops.push(`${MARGIN_X} ${y} Td (${escapePdfText(line.text)}) Tj`);
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
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );
  objectBodies.push(
    `${boldFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
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

  return new TextEncoder().encode(pdf);
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
  lines.push({ text: `Date Reported: ${formatDate(payload.reportedDate)}` });
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
    text: `of the date of this notice (by ${formatDate(addDays(payload.noticeDate, cureDays))}).`,
  });
  lines.push({ text: '' });

  // Hearing info
  if (payload.hearingDate) {
    lines.push({ text: 'Hearing Information:', bold: true });
    lines.push({
      text: `A hearing has been scheduled for ${formatDate(payload.hearingDate)}.`,
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
  lines.push({ text: `Date and Time: ${formatDate(payload.hearingDate)}` });
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

  // 14-day advance notice validation
  const hearingDateObj = typeof payload.hearingDate === 'string'
    ? new Date(payload.hearingDate)
    : payload.hearingDate;
  const noticeDateObj = new Date(payload.noticeDate);
  const daysBetween = Math.floor(
    (hearingDateObj.getTime() - noticeDateObj.getTime()) / (1000 * 60 * 60 * 24),
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

  // Rights
  lines.push({ text: 'Your Rights at the Hearing:', bold: true });
  lines.push({ text: '1. You have the right to attend the hearing and be heard.' });
  lines.push({ text: '2. You may present evidence and witnesses in your defense.' });
  lines.push({ text: '3. You may be represented by legal counsel at your own expense.' });
  lines.push({ text: '4. You may request a continuance if you need additional time to prepare.' });
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
  lines.push({ text: '- Impose a fine, subject to approval by a committee of members who are' });
  lines.push({ text: '  not officers, directors, or their relatives, and not to exceed $100 per' });
  lines.push({ text: '  violation, up to $1,000 in aggregate (F.S. 718.303 / 720.305)' });
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

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}
