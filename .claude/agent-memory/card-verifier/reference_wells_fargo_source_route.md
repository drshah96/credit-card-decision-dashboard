---
name: wells-fargo-source-route
description: Wells Fargo publishes everything in plain HTML, but its product pages list fewer benefits than its Guide to Benefits, which is how a real coverage got recorded as absent
metadata:
  type: reference
---

**Wells Fargo is the most cooperative issuer in this catalog.** Every number is
in plain server-rendered HTML. Four documents per card, all indexed at
`www.wellsfargo.com/credit-cards/agreements/`, which is the durable entry point
when per-card URLs rot:

- the product page on `creditcards.wellsfargo.com`
- the **Important Credit Terms** at `wellsfargo.com/credit-cards/{slug}/terms/`
- the Account Agreement
- the **Guide to Benefits**

Cite the Important Credit Terms' own effective date, not the "Prime Rate as of"
date printed beside it.

**The trap: the product page's benefit list is shorter than the Guide to
Benefits, and the difference is not cosmetic.** On `wells-fargo-reflect` the
product page named five benefits and omitted a $50,000 auto rental waiver that
Wells Fargo actually grants, so the file recorded it as "not published for this
card". Verify every `insurance[]` row against the Guide to Benefits. The Guide
enumerates covered benefits, so absence from **it** is a positive finding;
absence from the product page is nothing.

**Not fetchable:** the rewards program terms at `consumercard.wellsfargorewards.com`
are a fragment-routed JS app, so redemption cpp values and earning exclusions come
back unverified on any card with a rewards programme.

**Sibling cards genuinely differ, so do not sweep.** On 2026-09-05 Active Cash
carried an introductory 3% transfer fee for 120 days then up to 5%, while Reflect
carried a flat 5% with no intro tier. Same field, same issuer, both correct.
