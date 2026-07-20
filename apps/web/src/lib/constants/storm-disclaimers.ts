/**
 * Storm-tools disclaimer copy — SINGLE SOURCE OF TRUTH.
 *
 * ⚠️ ATTORNEY-REVIEWED COPY — do not edit without re-review.
 * ---------------------------------------------------------------------------
 * Redlines from the 2026-07-20 legal review applied. Enabled 2026-07-20 on that
 * review; final Florida-counsel signature is still recommended. Entity wording
 * genericized ("association" → "association or property manager" / "your
 * community’s insurance agent") so the copy is accurate for the apartment
 * communities the feature is now enabled for, in addition to condo/HOA
 * associations — the §626.854 and §627.70132 legal hedges are unchanged.
 *
 * These strings live here — not inline in components — so the reviewed wording
 * cannot drift per-page.
 *
 * The bright line this copy must hold (from the §626.854 public-adjuster rule):
 * a storm-damage report is a RECORD the association or property manager keeps for its own tracking.
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
  'This is a damage record your association or property manager keeps for its own tracking — it is ' +
  'not an insurance claim. PropertyPro does not file, adjust, or settle insurance claims and is not ' +
  'a public adjuster (Fla. Stat. §626.854). Submitting a report here does not notify any insurer or ' +
  'start a claim, and nothing here is insurance, legal, engineering, or financial advice. To start a ' +
  'claim, contact your own insurer or your community’s insurance agent.' +
  ' Insurance claims also have strict deadlines under Florida law — generally within 1 year of the ' +
  'date of loss, and 18 months for a supplemental claim — and this app does not calculate, track, or ' +
  'remind you of them, so contact your insurer or agent right away.';

/**
 * Shorter one-line version repeated on each report card so the no-claim hedge
 * travels with the record, not just the section header.
 */
export const STORM_DAMAGE_CARD_DISCLAIMER =
  'A damage record for your association or property manager — not an insurance claim. PropertyPro ' +
  'does not file or adjust claims (§626.854).' +
  ' Statuses shown here are for internal tracking only and do not reflect any insurer ' +
  'decision, coverage, or claim status.';

/**
 * Helper text under the free-text description/location fields. The report is
 * visible to the board and management, so reporters should not enter other
 * people’s personal information.
 */
export const STORM_DAMAGE_DESCRIPTION_HINT =
  'Describe what you saw and where. This report is visible to your board and management, so do not ' +
  'enter anyone’s personal information — no Social Security, driver-license, account, or credit-card ' +
  'numbers, no contact details (email, phone, or emergency contacts), and no health, medical, or ' +
  'health-insurance information. For life-threatening or emergency damage, call 911 or your local ' +
  'emergency number first.';

/**
 * Confirmation shown to the reporter after a report is filed. Reiterates that
 * no claim has been started.
 */
export const STORM_DAMAGE_SUBMITTED_CONFIRMATION =
  'Thanks — your damage report was recorded for your association or property manager. This is not an ' +
  'insurance claim and does not notify any insurer. Insurance claims have strict deadlines under ' +
  'Florida law — generally 1 year from the date of loss, and 18 months for a supplemental claim — ' +
  'and PropertyPro does not track them. To protect your rights, contact your own insurer or your ' +
  'community’s insurance agent to file a claim now.';

/**
 * Board/admin-facing note near the status control. Frames the status as internal
 * tracking, not a coverage or claim determination.
 */
export const STORM_DAMAGE_STATUS_NOTE =
  'Status is for internal tracking only. It does not reflect any insurer decision, ' +
  'coverage determination, or claim status.';
