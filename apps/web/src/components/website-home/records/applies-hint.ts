/**
 * Why a "may apply" record might not be owed, in plain words: the one line the
 * Add records drawer shows under a conditional item, so a board volunteer can
 * tell whether it is theirs to post or to mark "Doesn't apply".
 *
 * These describe when the record usually applies. They don't say whether it
 * applies to this association, and they are not legal advice.
 */
export const APPLIES_HINT: Readonly<Record<string, string>> = {
  '718_inspection_reports': 'Usually applies to buildings three or more stories tall.',
  '718_sirs': 'Usually applies to buildings three or more stories tall.',
  '718_bids': 'Usually applies once a bidding period for a contract has closed.',
  '720_bids': 'Usually applies once a bidding period for a contract has closed.',
  '718_video_recordings': 'Usually applies when meetings are held by video conference.',
  '718_conflict_contracts':
    'Usually applies when the association has a contract with a director, an officer, or a relative of one.',
};
