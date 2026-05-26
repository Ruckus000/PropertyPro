/**
 * Help search alias map.
 *
 * Each group is a set of terms that should match each other in help search:
 * a query for "fees" should also match articles about "assessments", and a
 * query containing "718.111" should match articles tagged with the full
 * "§718.111(12)(g)" statute reference.
 *
 * Alias-derived hits are weighted at 0.7× the score of a direct hit so an
 * article that mentions the literal query still ranks above an article that
 * only matches via an alias. See ranking helpers in
 * apps/web/src/lib/services/help-article-service.ts.
 *
 * Adding new aliases: keep groups symmetric (every term in a group is an
 * alias for every other term in the group). Lower-case all terms; lookup is
 * case-insensitive. Groups should reflect real Florida community-management
 * vocabulary — the goal is closing the synonym gap the 2026-05-07 audit
 * surfaced (e.g. board members search for "rules" but articles use the
 * legally-correct "covenants").
 */

const ALIAS_GROUPS: readonly (readonly string[])[] = [
  // Money
  ['assessments', 'assessment', 'fees', 'fee', 'dues', 'maintenance fees'],
  // Governing documents
  ['covenants', 'covenant', 'rules', 'rule', 'bylaws', 'bylaw', 'restrictions', 'restriction'],
  // Personnel acronyms
  ['cam', 'community association manager', 'manager'],
  ['arc', 'acc', 'architectural review', 'architectural review committee'],
  // Compliance terminology
  ['violation', 'violations', 'fine', 'fines', 'enforcement'],
  ['sirs', 'milestone inspection', 'structural integrity reserve study'],
  // Statute / bill numerals — bidirectional with §-prefixed forms
  ['718.111', '§718.111', '§718.111(12)(g)'],
  ['720.303', '§720.303'],
  ['hb 1203', 'hb1203', 'house bill 1203'],
  ['hb 919', 'hb919'],
  // Documents
  ['minutes', 'meeting minutes', 'board minutes'],
  ['budget', 'annual budget'],
  // Voting
  ['quorum', 'voting threshold'],
  ['proxy', 'proxies', 'absentee ballot'],
  ['vote', 'votes', 'voting', 'ballot', 'election', 'elections', 'poll', 'polls'],
  // Tenancy
  ['tenant', 'tenants', 'renter', 'renters', 'lessee', 'lessees'],
  ['owner', 'owners', 'unit owner', 'unit owners', 'homeowner', 'homeowners'],
  // Workflow verbs that map to specific admin surfaces (join requests, ARC, maintenance triage)
  ['approve', 'approved', 'approval', 'approvals', 'accept', 'accepted', 'reject', 'rejected', 'rejects', 'rejection', 'rejections', 'deny', 'denied', 'denies', 'denial', 'denials'],
  // Broadcast / outbound notifications
  ['broadcast', 'broadcasts', 'emergency notification', 'emergency notifications'],
  // Money inflow — kept separate from the assessments/fees group so "invoice"
  // does not expand to "fees" unless the article author opts in explicitly.
  ['invoice', 'invoices', 'bill', 'bills', 'payment', 'payments'],
  // Onboarding terminology used by PM admins setting up a new community
  ['onboard', 'onboarding', 'setup', 'set up', 'kickoff'],
] as const;

export interface ExpandedQuery {
  /** Lower-cased terms taken directly from the user query (whitespace-tokenised). */
  primary: string[];
  /** Alias terms derived from primary terms via ALIAS_GROUPS. */
  aliases: string[];
}

/**
 * Expand a user query into primary terms plus alias terms. Returns lower-
 * cased strings ready for substring matching. The full query string is
 * always included as a primary term (so "fees" matches "fees" articles even
 * before alias expansion).
 */
export function expandQuery(query: string): ExpandedQuery {
  const trimmed = query.trim().toLowerCase();
  const primary = new Set<string>();
  const aliases = new Set<string>();

  if (!trimmed) {
    return { primary: [], aliases: [] };
  }

  primary.add(trimmed);
  const tokens = trimmed.split(/\s+/).filter((t) => t.length >= 2);
  const tokenSet = new Set(tokens);
  for (const token of tokens) {
    primary.add(token);
  }

  // For each alias group, if any member matches the query, add every other
  // member to the alias set.
  //
  // Match rules:
  //   - Multi-word terms ("community association manager", "hb 1203")  →
  //     substring match against the trimmed query. Phrase-like terms are
  //     specific enough that a substring hit is almost certainly intentional.
  //   - Single-word terms ("cam", "fees", "718.111") → whole-token match
  //     only. Substring matching on short single words causes false
  //     expansions: "camera".includes("cam") is true, but a user searching
  //     for "camera" did not mean CAM the role. The token-equality test
  //     (`tokenSet.has(term)`) requires the user to have typed the alias
  //     as its own word.
  for (const group of ALIAS_GROUPS) {
    const matched = group.some((term) =>
      term.includes(' ') ? trimmed.includes(term) : tokenSet.has(term),
    );
    if (!matched) continue;
    for (const term of group) {
      if (!primary.has(term)) {
        aliases.add(term);
      }
    }
  }

  return {
    primary: [...primary],
    aliases: [...aliases],
  };
}
