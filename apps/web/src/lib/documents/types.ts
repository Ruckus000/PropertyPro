export interface DocumentMutationWarning {
  code: string;
  message: string;
}

export interface DocumentMutationResult {
  document: Record<string, unknown>;
  warnings: DocumentMutationWarning[];
}
