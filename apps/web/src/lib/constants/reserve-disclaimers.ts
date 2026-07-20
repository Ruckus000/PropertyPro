// ATTORNEY REVIEW REQUIRED before enabling hasReserveTransparency — placeholder copy
/**
 * Reserve-transparency disclaimer copy — SINGLE SOURCE OF TRUTH.
 *
 * ⚠️ ATTORNEY-REVIEW GATE (blocking before prod enablement)
 * ---------------------------------------------------------------------------
 * Every string in this file is PLACEHOLDER copy and must be reviewed by Florida
 * counsel before the reserve-transparency register is enabled in production
 * (hasReserveTransparency), and must not be edited afterwards without
 * re-review. They live here — not inline in components — so the reviewed
 * wording cannot drift per-page.
 *
 * The constraints these strings encode (matching the SIRS transparency posture
 * in .claude/rules/florida-compliance.md):
 *
 * 1. FACTUAL DATA ONLY. The register shows exactly the numbers the association
 *    entered — nothing is computed about condition or funding beyond a neutral
 *    remaining-useful-life countdown.
 * 2. NOT A RESERVE STUDY. This is not a reserve study, a structural integrity
 *    reserve study (SIRS), or a milestone inspection, and it does not replace
 *    one.
 * 3. NO ADEQUACY ASSESSMENT / NO ADVICE. Nothing here says whether reserves are
 *    adequate. PropertyPro does not provide engineering, financial, or legal
 *    advice.
 */

/**
 * Standing disclaimer shown at the top of the reserve register. The bright
 * line: factual data the association entered, not an adequacy assessment.
 */
export const RESERVE_TRANSPARENCY_DISCLAIMER =
  'This register shows the data the association entered. It is not an assessment of reserve ' +
  'adequacy or a reserve study, and PropertyPro does not provide engineering, financial, or legal ' +
  'advice.';

/**
 * One-line hedge repeated inside each asset card so the no-assessment framing
 * travels with the remaining-useful-life countdown, not just the page header.
 */
export const RESERVE_ASSET_CARD_DISCLAIMER =
  'Remaining useful life is a simple count from the entered install year and expected life. It ' +
  'does not reflect the component’s condition or whether reserves are adequate.';

/**
 * Caption under the remaining-useful-life figure. Reframes the number as a
 * calculation from entered data, not a professional determination.
 */
export const RESERVE_RUL_CAPTION =
  'Calculated from the install year and expected useful life the association entered — not a ' +
  'condition assessment or reserve study.';

/**
 * Inline helper under the free-text notes field. Notes are shown to every
 * member, so authors must not enter resident personal data
 * (§718.111(12)(c) / §720.303(5)).
 */
export const RESERVE_NOTES_HINT =
  'This note is visible to everyone who can see this register. Enter facts about the component ' +
  'only — do not enter personal information about owners or residents.';

/**
 * Empty-state / admin helper copy shown where a board adds the first asset.
 */
export const RESERVE_TRANSPARENCY_ADMIN_HINT =
  'Add each major component with the year it was installed and its expected useful life. Owners ' +
  'see a transparent register with a remaining-useful-life countdown. This is a record you enter, ' +
  'not a reserve study.';
