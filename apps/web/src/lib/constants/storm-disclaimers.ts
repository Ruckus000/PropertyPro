/**
 * Storm-tools disclaimer copy — SINGLE SOURCE OF TRUTH.
 *
 * ⚠️ ATTORNEY REVIEW REQUIRED before enabling hasStormTools — placeholder copy.
 * ---------------------------------------------------------------------------
 * Every string in this file is PLACEHOLDER wording and must be reviewed by
 * Florida counsel before the storm-damage feature is enabled in production, and
 * must not be edited afterwards without re-review. They live here — not inline
 * in components — so the reviewed wording cannot drift per-page. The feature
 * ships DARK behind the per-community `hasStormTools` flag; enablement is gated
 * on this review plus the flag.
 *
 * The bright line this copy must hold (from the §626.854 public-adjuster rule):
 * a storm-damage report is a RECORD the association keeps for its own tracking.
 * It is NOT an insurance claim. PropertyPro does not file, adjust, negotiate, or
 * settle insurance claims, is not a public adjuster, and gives no insurance,
 * legal, engineering, or financial advice. Submitting a report here does not
 * notify any insurer and starts no claim.
 */

/**
 * Standing disclaimer shown at the top of the storm-damage section and inside
 * the report dialog. The core §626.854 line.
 */
export const STORM_DAMAGE_DISCLAIMER =
  'This is a damage record your association keeps for its own tracking — it is not an insurance ' +
  'claim. PropertyPro does not file, adjust, or settle insurance claims and is not a public ' +
  'adjuster (Fla. Stat. §626.854). Submitting a report here does not notify any insurer or start a ' +
  'claim, and nothing here is insurance, legal, engineering, or financial advice. To start a claim, ' +
  'contact your own insurer or the association’s agent of record.';

/**
 * Shorter one-line version repeated on each report card so the no-claim hedge
 * travels with the record, not just the section header.
 */
export const STORM_DAMAGE_CARD_DISCLAIMER =
  'A damage record for the association — not an insurance claim. PropertyPro does not file or adjust ' +
  'claims (§626.854).';

/**
 * Helper text under the free-text description/location fields. The report is
 * visible to the board and management, so reporters should not enter other
 * people’s personal information.
 */
export const STORM_DAMAGE_DESCRIPTION_HINT =
  'Describe what you saw and where. This report is visible to your board and management. Do not ' +
  'enter other people’s personal information (SSNs, account or license numbers). For life-threatening ' +
  'or emergency damage, call 911 or your local emergency number first.';

/**
 * Confirmation shown to the reporter after a report is filed. Reiterates that
 * no claim has been started.
 */
export const STORM_DAMAGE_SUBMITTED_CONFIRMATION =
  'Thanks — your damage report was recorded for the association. This does not start an insurance ' +
  'claim; contact your insurer or the association’s agent to file one.';

/**
 * Board/admin-facing note near the status control. Frames the status as internal
 * tracking, not a coverage or claim determination.
 */
export const STORM_DAMAGE_STATUS_NOTE =
  'Status is for the association’s internal tracking only. It does not reflect any insurer decision, ' +
  'coverage determination, or claim status.';
