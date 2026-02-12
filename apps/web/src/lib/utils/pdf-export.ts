/**
 * Minimal PDF generator for checklist export.
 *
 * No external deps — builds a small PDF with uncompressed text so tests can
 * assert on the byte content. Not intended for high-fidelity rendering.
 */
import type { ComplianceStatus } from "./compliance-calculator";

export interface PdfChecklistItem {
  title: string;
  category: string;
  status: ComplianceStatus;
  deadline?: string | null;
}

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Build the PDF content stream with one line per item. */
function buildContent(items: PdfChecklistItem[]): string {
  const lines: string[] = [];
  let y = 780; // start near top of page
  lines.push("BT");
  lines.push("/F1 12 Tf");
  for (const item of items) {
    const parts: string[] = [];
    parts.push(item.title);
    parts.push(`[${item.category}]`);
    parts.push(`status=${item.status}`);
    if (item.deadline) parts.push(`deadline=${item.deadline}`);
    const text = escapePdfText(parts.join("  •  "));
    lines.push(`36 ${y} Td (${text}) Tj`);
    y -= 18;
    if (y < 36) break; // one simple page only
  }
  lines.push("ET");
  return lines.join("\n");
}

/**
 * Generate a single-page PDF containing the provided items as text lines.
 * Returns a Uint8Array suitable for creating a Blob in the browser.
 */
export function generateChecklistPdf(items: PdfChecklistItem[], title: string = "Compliance Checklist"): Uint8Array {
  // PDF objects
  const header = "%PDF-1.4\n";

  const content = buildContent([
    { title, category: "", status: "satisfied" },
    ...items,
  ]);
  const contentStream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`;

  const objects: string[] = [];
  // 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  // 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  // 3: Page
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
  );
  // 4: Contents
  objects.push(`4 0 obj\n${contentStream}endobj\n`);
  // 5: Font
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  // Build xref table
  let body = "";
  const offsets: number[] = [];
  let cursor = header.length;
  for (const obj of objects) {
    offsets.push(cursor);
    body += obj;
    cursor += obj.length;
  }
  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const pdfString = header + body + xref + trailer;
  const encoder = new TextEncoder();
  return encoder.encode(pdfString);
}

