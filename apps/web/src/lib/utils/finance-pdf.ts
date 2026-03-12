interface FinanceStatementLedgerEntry {
  effectiveDate: string;
  entryType: string;
  amountCents: number;
  description: string;
}

interface FinanceStatementLineItem {
  dueDate: string;
  status: string;
  amountCents: number;
  lateFeeCents: number;
}

interface FinanceStatementPayload {
  unitId: number;
  balanceCents: number;
  ledgerEntries: FinanceStatementLedgerEntry[];
  lineItems: FinanceStatementLineItem[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const START_X = 36;
const START_Y = 744;
const LINE_HEIGHT = 14;
const MAX_LINES_PER_PAGE = 48;

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toUsd(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function chunkLines(lines: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES_PER_PAGE) {
    chunks.push(lines.slice(i, i + MAX_LINES_PER_PAGE));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function buildPageContent(lines: string[]): string {
  let y = START_Y;
  const ops: string[] = ['BT', '/F1 10 Tf'];
  for (const line of lines) {
    ops.push(`${START_X} ${y} Td (${escapePdfText(line)}) Tj`);
    y -= LINE_HEIGHT;
  }
  ops.push('ET');
  return ops.join('\n');
}

export function generateFinanceStatementPdf(payload: FinanceStatementPayload): Uint8Array {
  const lines: string[] = [];
  lines.push(`Finance Statement - Unit ${payload.unitId}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Current Balance: $${toUsd(payload.balanceCents)}`);
  lines.push('');
  lines.push('Line Items');
  lines.push('Due Date     Status     Amount    Late Fee');
  for (const item of payload.lineItems) {
    lines.push(
      `${item.dueDate.padEnd(12)}${item.status.padEnd(11)}$${toUsd(item.amountCents).padStart(8)}  $${toUsd(item.lateFeeCents).padStart(8)}`,
    );
  }
  lines.push('');
  lines.push('Ledger Entries');
  lines.push('Date         Type        Amount    Description');
  for (const entry of payload.ledgerEntries) {
    const truncatedDescription = entry.description.length > 52
      ? `${entry.description.slice(0, 49)}...`
      : entry.description;
    lines.push(
      `${entry.effectiveDate.padEnd(12)}${entry.entryType.padEnd(12)}$${toUsd(entry.amountCents).padStart(8)}  ${truncatedDescription}`,
    );
  }

  const pages = chunkLines(lines);
  const objectBodies: string[] = [];
  const xref: number[] = [0];
  let pdf = '%PDF-1.4\n';

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  let nextId = 4;
  const pageIds: number[] = [];

  objectBodies.push(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);
  objectBodies.push(`${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

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
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
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
