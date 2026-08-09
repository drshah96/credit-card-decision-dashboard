---
name: adr-rigor
description: What this user checks in an ADR — measured numbers over estimates, mechanical guards over stated policy, and no field seeded with a proxy for a value it doesn't have
metadata:
  type: feedback
---

Three standards this user applied when reviewing ADR 0001. All three were
corrections to work that already looked complete.

**Compute the steady-state number, not just the limit.** A cap, a threshold, or a
budget is not an answer on its own; the question is always whether demand fits
under it. Run the arithmetic against the real catalog and state the result in the
document. In 0001 this changed a recommendation: simulating the real tier split
(37/42/30 cards at 30/90/180 days, 1.87 verifications/day demand) showed a cap of
3/day allowed 11 days of slip past the stated floor while a cap of 4 gave zero,
so the recommended cap moved from 3 to 4. The estimate in the first draft was
"about 1.5/day" from invented tier counts, and it was close enough to feel right
and wrong enough to pick the wrong cap.

**A rule that automation could skip needs a CI check, not a policy sentence.**
"The writer will always add a timeline entry" is folklore. The test that fails
the PR is the mechanism. This user specifically flags rules whose violation
produces a *clean-looking* result, because those survive human review
indefinitely. Same reasoning as the repo's drift pins.

**When a design crosses a boundary the repo deliberately built, name it and match
the control type.** This repo uses *capability* controls, not review controls:
`card-author` writes only to `staging/`, `card-verifier` cannot write, `drafts
promote` needs a tty plus a hook. Saying "but there's a PR gate" understates it,
because a PR gates merging, not what the job can propose. The expected response
is mechanical containment at the same layer: scoped token permissions, and a
diff-scope check limiting changes to the fields actually verified.

**Never seed a field with a plausible proxy for a value you don't have.** The
first draft backfilled `last_verified_ok_at` from `git log -1` on the card file.
The user rejected it: last-edited is not last-verified, and a `"seeded_from_git"`
marker doesn't help because the scheduler reads the date, not the marker. `null`
was correct because it is the only value that cannot be mistaken for evidence.
Weight this heavily for any field that might become user-facing.

**Why:** Each correction targeted a claim the document made that the system
couldn't actually back. The through-line is that a design document should not
assert a property unless something enforces it.

**How to apply:** Before finishing any ADR, check every stated bound against real
data, and for each invariant ask what fails if it's violated. If the answer is
"nothing, it just looks fine," that invariant needs a test.

Related: [[adr-log]], [[repo-architectural-constraints]].
