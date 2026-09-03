/**
 * Can this template be acted on yet?
 *
 * Previously inlined in `new-submission-form.tsx`, which is how the detail
 * page came to offer Send on a template that cannot be sent.
 */

/**
 * A template with no stored PDF cannot be sent: `createSubmission` throws
 * "Template must have a source PDF before it can be sent for signing".
 * Offering the verb anyway just moves the failure later.
 */
export function templateHasSourceDocument(template: Record<string, unknown>): boolean {
  const path = template['sourceDocumentPath'];
  return typeof path === 'string' && path.trim().length > 0;
}
