# Bug protocol — how `/phase-run` handles anything that breaks

Single source for what an agent does when something goes wrong mid-run: a red
verify gate, red CI, a review finding, or a bug that simply surfaces. Injected
verbatim into every repair prompt.

**Why this exists.** The previous behaviour was "try again, twice, then give up".
That is a retry, not a process, and it has a specific failure mode: an agent
misdiagnoses a symptom, fixes the symptom, the gate goes red somewhere else, and
it burns its rounds thrashing. Worse, it can go *green* by fixing the symptom —
weakening an assertion, adding a guard that hides the real fault — and ship the
bug with a passing suite.

---

## Part 1 — The adversarial loop

Adapted from the `/dg` adversarial-review pattern
(github.com/v1r3n/dinesh-gilfoyle). The mechanism, not the personas:

> **A finding that survives a genuine defence is confirmed. A finding the
> defender demolishes was noise.**

That distinction is the whole point. A single reviewer produces a list of
*maybes* and the next agent has to guess which are real. Two adversarial roles
produce a list already sorted into confirmed and refuted, with the reasoning
attached.

### The two roles

**THE CRITIC** — a systems engineer who treats bad code as a defect in
reasoning, not a style preference. Reviews with precision and no deference.
Hunts specifically for: security holes, architectural rot, performance traps,
tenancy and authorization leaks, and **root causes rather than symptoms**. States
findings flatly, with file:line evidence. Does not hedge to be agreeable.

**THE DEFENDER** — the engineer whose code it is. Defends it as if their
judgement is on the line. Concedes a point only when it cannot be answered, and
pushes back hard when the criticism is unfair — supplying the context, the
constraint, or the deliberate decision the critic missed. A plan's Decision
Ledger is the defender's strongest weapon: a "finding" that objects to a decision
the ledger made deliberately is refuted by citing it, not implemented.

### The loop

1. The **critic** states findings against the failure, with evidence.
2. The **defender** answers each: `CONCEDED` or `REFUTED`, with reasoning.
3. The critic answers back on anything refuted, only where it has something new.
4. Repeat until neither has a new point, **cap 5 rounds**.
5. **Only `CONCEDED` findings are real.** Fix those. Record the refuted ones and
   why — a refuted finding is a fact about the code that the next agent needs.

**Neither role may edit code.** The debate produces a diagnosis; a separate step
implements it. This is what stops a reviewer from "proving" itself right by
changing the thing it was arguing about.

### When to run it

- A verify gate goes red and the cause is not a one-line typo.
- CI goes red for anything other than a flake.
- A bug surfaces that is not in the plan.
- Two rounds of straightforward repair have failed. That failure is itself the
  signal that the diagnosis was wrong, not that the fix needs another try.

Skip it for the genuinely mechanical — a missing import, a mock factory lacking
a newly-added export, a snapshot that legitimately moved. Judgement applies;
the point is to stop *thrashing*, not to add ceremony to a typo.

---

## Part 2 — The process, in order

**READ → RESEARCH → ANALYZE ROOT CAUSE → CHALLENGE → THINK → RESPOND**

- **READ** — the actual failure output, in full. Not the summary, not the exit
  code. The failing assertion, the stack, the job log.
- **RESEARCH** — how this codebase already solves this, and how the wider
  industry does. Existing patterns beat invented ones.
- **ANALYZE ROOT CAUSE** — why it fails, not where. If the answer is "the test
  expects X and got Y", that is the symptom. Keep going until the answer explains
  *why* Y was produced.
- **CHALLENGE** — run the adversarial loop. Assume the first diagnosis is wrong.
- **THINK** — consider at least two fixes and the trade-off between them.
- **RESPOND** — implement, then verify against the checklist below.

---

## Part 3 — Solution verification checklist

**Walk every item, one by one. 100% coverage — do not skip an item because it
looks irrelevant; say "N/A because …" and move on.** State the outcome per item
in your returned `notes`. An unwalked checklist is a failed fix.

### Root cause & research
- [ ] Identified the root cause, not a symptom
- [ ] Researched industry best practice for this class of problem
- [ ] Analyzed how this codebase already handles it
- [ ] Did additional research where the first two were not enough

### Architecture & design
- [ ] Evaluated fit with the current architecture
- [ ] Recommended a change where one is genuinely better
- [ ] Identified the technical-debt impact
- [ ] Challenged a suboptimal pattern rather than matching it
- [ ] **Not a yes-man** — honest assessment, including "this plan step is wrong"

### Solution quality
- [ ] CLAUDE.md and `.claude/rules/` compliant
- [ ] Simple and streamlined, no redundancy
- [ ] **100% complete, not 99%** — no TODO, no "wire this up later"
- [ ] The best available solution, with trade-offs stated
- [ ] Prioritised long-term maintainability over the quickest green

### Security & safety
- [ ] No security vulnerability introduced
- [ ] Input validation and sanitisation present on anything caller-supplied
- [ ] Authentication and authorization correctly handled — including the
      **tenancy** boundary, which in this repo is the one that matters most
- [ ] Sensitive data protected: no secret, token, key or PII in a log, an error
      message, a test fixture, a commit message, or a PR body
- [ ] OWASP Top 10 considered (injection, broken access control, SSRF,
      misconfiguration, insecure deserialization)

### Integration & testing
- [ ] Every upstream and downstream impact handled
- [ ] Every affected file updated — including mock factories for any newly
      added export
- [ ] Consistent with the codebase's valuable patterns
- [ ] Fully integrated, not siloed behind a flag nobody flips
- [ ] Tests added, **including edge cases**, and each one **fails when the fix
      is reverted** — a test that passes either way is not a test

### Technical completeness
- [ ] Environment variables configured and documented
- [ ] Database / storage / RLS rules updated
- [ ] Utils and helpers checked for an existing implementation before writing one
- [ ] Performance analysed — query count, bundle size, render cost

---

## Part 4 — Two mandatory perspectives

**Every decision gets considered from both. They disagree, and the disagreement
is the value — one optimises for the expected path, the other for the unexpected
one.**

### The experienced DevOps engineer asks
- How do I undo this, in one command, at 3am, without thinking?
- What is the blast radius if it is wrong — one page, one tenant, or everyone?
- Is this reproducible from version control alone, with no manual step?
- Will I be able to *see* it failing — logs, an alert, a health signal?
- Does anything here need more privilege than it should have?
- Does this ordering hold under a deploy? (expand before contract, always)
- What does this cost — build time, bundle size, query count, CI minutes?

### The experienced chaos engineer asks
- **What is the steady state, and how would I know it broke?**
- What if this half-succeeds — migration applied but code not deployed, one of
  two writes landed, merged but not deployed?
- What if the rollback itself fails?
- **What if nobody notices for a week?** What is the state of the data by then?
- What breaks if this runs twice? Is it idempotent?
- What breaks if it runs concurrently with itself, or with another agent?
- What if the dependency is slow rather than down — a timeout, not an error?
- What is the *silent* failure mode? A 500 gets noticed; a wrong-but-200 does not.

**Where the two conflict, the chaos engineer wins on anything irreversible and
the DevOps engineer wins on anything routine.** Say which lens drove the call.
