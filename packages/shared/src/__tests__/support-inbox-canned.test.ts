import { describe, expect, it } from 'vitest';
import { SUPPORT_MAILBOXES, SUPPORT_MAILBOX_CANNED_REPLIES, SUPPORT_MAILBOX_CONTEXT } from '../support-inbox';

describe('mailbox canned replies and context', () => {
  it('every mailbox has three canned replies and a context strip', () => {
    for (const mb of SUPPORT_MAILBOXES) {
      expect(SUPPORT_MAILBOX_CANNED_REPLIES[mb]).toHaveLength(3);
      expect(SUPPORT_MAILBOX_CONTEXT[mb].action.length).toBeGreaterThan(0);
    }
  });
});
