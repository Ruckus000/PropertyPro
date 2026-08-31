# Release-time legal checks

Two checks that CI cannot make for us, because both are about what English
sentences *claim* rather than about what code does. Run them before a release
that touched reserves, SIRS, insurance, or any help/marketing copy.

Source: `docs/audits/2026-08-09-legal-risk-audit.md` (F-09).

---

## 1. Reserve / SIRS adequacy language

**The rule.** PropertyPro displays factual data about reserves and inspections.
It never characterizes them. Saying reserves are "adequate", "sufficient" or
"underfunded" is a financial or engineering judgement, and PropertyPro is
licensed to make neither. This is the standing posture in
`.claude/rules/florida-compliance.md`, and `packages/shared` plus
`apps/web/src/lib/constants/reserve-disclaimers.ts` are written to state the
negation explicitly.

**The check.**

```bash
grep -rn -iE "\b(adequate|adequately|inadequate|sufficient|insufficient|underfunded|under-funded|fully funded|well-funded|healthy reserve)" apps/web/src apps/admin/src packages/*/src | grep -viE "\.test\.|__tests__"
```

**How to read the output.** Every legitimate hit falls into one of three
buckets, and *none* of them is an affirmative claim:

| Bucket | Example | Verdict |
|---|---|---|
| A disclaimer that **negates** the claim | `…does not state whether reserves are sufficient.` | Fine — this is the posture working |
| An unrelated permissions string | `redirect('/dashboard?reason=insufficient-permissions')` | Fine |
| An unrelated engineering comment | `a single daily run is sufficient` | Fine |

Anything that reads as the product's own assessment of a *specific
association's* reserves is a defect, regardless of how it is hedged.

**Why this is a grep and not a CI guard.** A regex cannot tell
"reserves are sufficient" from "does not state whether reserves are sufficient"
— the compliant sentences contain the offending phrase by construction. A guard
would either pass on everything or fire on every disclaimer, and a guard that
cries wolf gets ignored, which is worse than no guard. A human reading twenty
lines takes a minute.

**Result, 2026-08-10:** clean. Thirty hits, all three buckets, zero affirmative
claims.

---

## 2. Generated-notice and help-copy legal conclusions

Applies when `apps/web/src/lib/utils/violation-notice-pdf.ts` or any
`apps/web/src/content/help/**` file changes.

```bash
grep -rn -iE "(you are required to|you must|is required by law|constitutes a violation|the association is entitled)" apps/web/src/lib/utils/violation-notice-pdf.ts apps/web/src/content/help
```

Help articles carry an injected no-legal-advice notice
(`HelpArticleDisclaimer`), so the bar there is lower — the notice is doing work.
Generated notices are the sharp edge: they address an owner by name and are
read as coming from the association. Until F-05's DRAFT watermark ships,
**generated notices are gated off** (`noticePdfGenerationEnabled`), so this
check is for the moment they are re-enabled.
