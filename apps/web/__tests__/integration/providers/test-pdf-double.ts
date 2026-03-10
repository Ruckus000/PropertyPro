export interface CapturedPdfExtraction {
  communityId: number;
  documentId: number;
  path: string;
  mimeType: string;
  bucket?: string;
}

const pdfSink: CapturedPdfExtraction[] = [];

export function getCapturedPdfExtractions(): readonly CapturedPdfExtraction[] {
  return pdfSink;
}

export function clearCapturedPdfExtractions(): void {
  pdfSink.length = 0;
}

export function queuePdfExtractionDouble(params: CapturedPdfExtraction): void {
  pdfSink.push(params);
}
