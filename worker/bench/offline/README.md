# Offline bench — measurement with no API key and no spend

Everything in this directory runs for $0. It exists because the questions that
decide whether this product works had never been asked, and most of them turn
out not to need a model call at all.

The corpus is Canary's (`../../../../canary`): 15 published CVEs with real
vulnerable source trees, 4 clean controls, ground-truth fix lines, and 33
recorded model-generated patches from paid runs that already happened. Grading
matches `canary/src/canary/models.py:hit()` — a finding is located if it lands
within 3 lines of a line the real fix touched.

```
npm run bench:extract   # rebuild corpus.json from Canary's trajectories
npm run bench:gates     # run Hardener's patch gates over 33 real model patches
npm run bench:semgrep   # what the scanners score with no AI at all
```

## What these measured (2026-09-06)

**`gates.mjs` — the applier was throwing away two thirds of its input.**
Gate 1 applied 8 of 33 real model patches. Canary's applier managed 20 on the
same patches. The gap was mechanical: models write `--- requests/utils.py`
without the `a/` `b/` prefixes, and they miscount the `@@` header, which git
rejects outright as a corrupt patch. Adding those rungs to the ladder in
`validate.mjs` took gate 1 from 8/33 to **22/33 with zero regressions**. Being
permissive here is only safe because gates 2 and 3 exist — this gate answers
"can the patch be placed on the tree", never "does it fix anything".

The same run exposed a second defect: `--check` tried the whole ladder but the
real apply hardcoded `--3way`, so every patch needing a fallback died as
"patch passed --check but failed to apply" and could never be proven either way.

**Of all 33 patches, 0 repaired the CVE.** That is the number that matters, and
it has not moved.

**`semgrep_baseline.mjs` — the scanners are the recall ceiling.**

| arm | precision | recall | F1 |
|---|---|---|---|
| Semgrep alone, repo-wide | 0.200 | 0.091 | 0.125 |
| Semgrep alone, scoped to the bug's file | 0.000 | 0.000 | 0.000 |
| Canary AI baseline, gemini-3.5-flash | 0.556 | 0.455 | 0.500 |
| Canary AI baseline, gemini-3.7-flash | 0.333 | 0.182 | 0.235 |

The AI arm is 4x better than the scanners, which answers the "is the model just
decoration" question — **but not in a way this pipeline can currently collect.**
Canary handed the model a whole file and asked it to find the defect. Hardener
hands the model a Semgrep finding and asks whether it is real: `scan.mjs` only
ever loops over `runSemgrep + runGitleaks + runOsvScanner` output. The verifier
is a filter, and a filter can only ever remove findings.

Semgrep raised **zero** findings inside the vulnerable file for 13 of 15 tasks.
On those the model is never shown the bug and cannot flag it at any price. So
Semgrep's 9% recall is a hard ceiling on Hardener's recall, and the 0.50 F1
belongs to an architecture this worker does not have.

That makes the next experiment an architectural one, not a prompt one: give the
model files rather than SARIF rows and measure whether detection moves. It is
the cheapest way to find out whether the ceiling is real.
