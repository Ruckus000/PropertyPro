/**
 * Can this template be acted on yet?
 *
 * Both answers were previously inlined in one component each, which is how
 * the templates list came to offer no actions at all and the detail page came
 * to offer Send on a template that cannot be sent.
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

/**
 * Field edits are refused server-side while any signature request from this
 * template is still open, because the signing page reads the field schema
 * live rather than from a snapshot. Read the count the template detail
 * response carries; absent means "not known here", which is treated as zero
 * so a list row without the count still offers the verb and the server
 * remains the real gate.
 */
export function templateFieldsAreEditable(template: Record<string, unknown>): boolean {
  const count = template['inFlightSubmissionCount'];
  return typeof count === 'number' ? count === 0 : true;
}

/** "2 signature requests still out" — the phrase both surfaces use. */
export function describeInFlightSignatures(count: number): string {
  return `${count} signature ${count === 1 ? 'request' : 'requests'} still out`;
}
