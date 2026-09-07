# Hardener — Implementation Plan

**Written 6 September 2026.** This is the plan of record. `HARDENER_ROADMAP.md`
is the historical build log; where the two disagree about status, this file wins.

Four parts, in dependency order. Every step carries a **Proof** line — the thing
that has to be true before the step counts as done. That convention is not
decoration: this codebase has twice reported success it had not earned, both
times because a claim was asserted rather than executed. A step without a
satisfied proof line is not finished, however much of it is written.

Every number below was measured in this repository, and the ones marked
reproducible can be re-derived with no API key.

---

## Read this first — the plain-English version

**What "working" looks like:** a stranger lands on the site, signs up, pastes a
GitHub link, waits, and gets a list of security problems in that code. Every one
of those steps works today *except* the paste-a-link one — and that single
failure makes everything after it unreachable.

**1. Stop turning users away at the door.** The app has a rule: *before I scan
anything, prove you own it.* Sensible for someone's live website. But it applies
to everything — so when a user pastes a GitHub link, the app reads the address,
sees `github.com`, and asks them to prove they own github.com. Nobody can. It
refuses every time. Fix: ask that question only for websites. Reading code that
is already public is not intrusive. *(§1.1)*

**2. Take your own house keys off the table.** When Hardener offers a fix, it
opens the change request on GitHub *using Seyi's personal account*. That is
invisible today because nobody can get far enough to trigger it. The moment step
1 lands, any stranger who signs up can make that account post code changes on any
public project they pick. Ships with step 1, never after. *(§1.2)*

**3. Give the scan somewhere to run.** Vercel hosts the site but cannot run the
scan — it kills anything past a few seconds, and the scanners are heavy programs.
A separate machine takes the job, immediately says "got it", and works in the
background. The scan runs as its own program, so a crashed scan does not take the
service down with it. *(§1.3)*

**4. Handle the machine being asleep or busy.** Don't mark a scan failed just
because the machine was waking up, and tell the user "starting up — the first
scan takes about a minute" rather than showing a spinner that looks broken.
*(§1.4, §1.7)*

**5. Put the settings in the right places.** ~20 on the web host, a handful on the
scanner host. Tedious, not hard — and the app refuses to start if any are
missing, so mistakes surface immediately. *(§1.5)*

**6. Let people scan private code.** Everything above covers public code only.
Private repositories need the screen that says *"Hardener wants access to these 3
repositories. Allow?"* — they choose which, access expires hourly, they can cut it
off themselves. Biggest single piece of work here. *(§1.6)*

**7. Decide whether launching needs an AI key at all.** Today no key means every
scan fails. But much of what Hardener does needs no AI: checking whether a
project's dependencies contain known vulnerabilities is a lookup in a public
database, like checking a list of recalled products. Exact, free — and today a
model is being paid to second-guess it, and can delete a real result. So there is
a real choice: **A** get a key and launch the full product, or **B** launch the
no-AI version now — works today, costs nothing to run, needs no key, and lets you
say "your code never leaves our scanner". **B is recommended**: the key is
blocked on the debt anyway, and it puts the product in front of real users weeks
sooner. *(Part 2)*

### Roughly how long

| | |
|---|---|
| Steps 1 + 2 (§1.1, §1.2) | ~a day |
| Steps 3 + 4 + 5 (§1.3–§1.5, §1.7) | 2–3 days |
| Step 7 / no-AI mode (Part 2) | 1–2 days |
| **First usable version** | **~a week** |
| Step 6 / private repos (§1.6) | several more days |

### Be straight with users about the limits

Working perfectly, this finds **known problems in known places** — vulnerable
dependencies, leaked credentials, common coding mistakes. It does not find subtle
logic flaws; that was measured on 6 Sep and the number was poor. Put that on the
site. A tool honest about its limits keeps customers; one that oversells loses
them the first time something it missed gets exploited.

---

## Part 0 — Done, and what it measured

Complete as of 6 Sep 2026. Left unstaged for review.

### 0.1 The grade-A bug is dead and pinned ✅

The guard added on 31 August compared `verifyErrors === total`, where `total`
counts findings the scanners raised and `verifyErrors` can never exceed
`MAX_FINDINGS`. On any repository with more than 25 findings, a completely dead
verifier still produced **score 100, grade A, status Completed**.

Logic extracted to `worker/report.mjs` as `completeness()`. It had broken twice
because it lived as a bare comparison inside a 200-line script with nothing able
to test it.

> **Proof:** 7 regression tests in `worker/test/report.test.mjs` naming both
> historical failures. Worker suite 21 passing, up from 10.

### 0.2 The applier was discarding two thirds of its input ✅

Measured against 33 real model-generated patches recorded in Canary: gate 1
applied 8. Canary's own applier managed 20 on identical input.

Two mechanical causes. Models write `--- requests/utils.py` with no `a/` `b/`
prefix, so `-p1` strips a real path segment. And they miscount the `@@` header,
which git rejects outright as a corrupt patch. Adding `-p0` and `--recount`
rungs to the ladder in `worker/validate.mjs` took gate 1 to **22/33 with zero
regressions**.

Permissiveness here is safe *only* because gates 2 and 3 exist. Gate 1 asks
whether a patch can be placed on the tree, never whether it repairs anything.

The same run exposed a second defect: `--check` tried the whole ladder but the
real apply hardcoded `--3way`, so every patch needing a fallback died as
"passed --check but failed to apply" and could never be proven either way.

> **Proof:** `npm run bench:gates` reproduces the table with no API key.
> Four tests pin both rungs and the check/apply mismatch.

### 0.3 A scan that cannot run now says so ✅

`src/lib/runner.ts` introduces `RUNNER=fly|github|none`. The old code fell
through to `console.log("Skipping Fly.io... Simulating for dev")` and returned
success, so on any deploy without a Fly token a scan flipped to Running and
stayed there forever. The Fly dispatch also never checked its own response.

> **Proof:** `none` writes status Failed with a reason.
> `.github/workflows/scan.yml` exists as a free fallback runner, with a
> `failure()` step that fails the row if the job itself dies.

### 0.4 A permanent zero-cost bench ✅

Canary's corpus reused as Hardener's: 15 published CVEs with real vulnerable
trees, 4 clean controls, ground-truth fix lines, and 33 recorded model patches
from runs already paid for. Grading matches `canary/src/canary/models.py:hit()`
exactly — a finding is located if it lands within 3 lines of a line the real fix
touched.

```
npm run bench:extract   # rebuild corpus.json from Canary trajectories
npm run bench:gates     # Hardener's patch gates over 33 real patches
npm run bench:semgrep   # what the scanners score with no AI at all
```

> **Proof:** runs offline forever, no key. Written up in
> `worker/bench/offline/README.md`.

### 0.5 Schema applied ✅

Migrations 002, 003, 004 applied 6 Sep via `supabase/APPLY_ME.sql`, all six
verification rows true.

---

## Part 1 — Make it work for someone who is not you

Frontend on Vercel, scanner on Render, database on Supabase.

### 1.1 + 1.2 must ship together

These are one change split across two files. Shipping 1.1 alone is worse than
the bug it fixes.

### 1.1 Split authorization by target type ✅ BUILT 6 Sep

`src/lib/target.ts` + 14 tests. Repository scans work. The parser is strict:
`github.com.evil.tld`, embedded credentials and path traversal are all refused,
and the clone URL is rebuilt from parsed parts so nothing reaches `git clone`
that we did not construct. Only github.com for now, deliberately.

<details><summary>original problem statement</summary>

`src/app/api/scan/route.ts:60` requires DNS-TXT domain verification for *every*
target. For `https://github.com/owner/repo` the hostname is `github.com`. Nobody
will ever verify `github.com`, so **every repository scan returns 403 before it
reaches a queue.** This is why "let someone test it" currently cannot happen.

The fix is a principled split, not a loosening:

- **git targets** — reading a public repository is not active testing. No domain
  verification, matching every SAST tool on the market.
- **web targets** — DNS-TXT stays exactly as it is. Pointing a scanner at a live
  site you do not own *is* unauthorized active testing, and this gate is one of
  the more mature things in the codebase.

Classify in the route with the same rule `worker/sources.mjs:classifyTarget`
uses.

</details>

> **Proof:** a fresh account, created through the real signup flow, queues a scan
> of a public repository and reaches status Running. **Not yet demonstrated —
> needs a deploy.**

### 1.2 Close the PR abuse vector ✅ BUILT 6 Sep

`/api/pr` now denies by default. `PR_ALLOWED_REPOS=owner/repo,...`; unset means
the feature is off (501). Repo parsing moved to the strict `parseGitHubRepo`.
Holding measure until the GitHub App (§1.6), and the code says so.

<details><summary>original problem statement</summary>

`src/app/api/pr/route.ts:40` uses a single global `process.env.GITHUB_TOKEN` —
**yours**. It checks the finding belongs to the caller's scan, then derives the
repo from that scan's `target_url`.

So the moment 1.1 drops domain verification for git targets, any stranger who
signs up can scan an arbitrary public repo, call `/api/pr`, and have Hardener
push a branch and open a pull request on that repo **from your GitHub account**.
Rate limits cap the volume; they do not change whose name is on it.

Minimum fix shipping alongside 1.1: refuse `/api/pr` unless the user has proven
access to the target repo (see 1.6). Until that exists, gate the route behind an
allow-list of repos you own.

</details>

> **Proof:** a user who has not proven access to a repo receives 403 from
> `/api/pr`, and no branch is created.

### 1.3 The scanner service ✅ BUILT 6 Sep — ⚠️ NEVER RUN AGAINST A REAL DOCKER DAEMON

`worker/server.mjs` (front desk, holds the keys, does the DB write) +
`worker/signature.mjs` (+8 tests pinning the wire format from both ends) +
a hardened `worker/Dockerfile` (non-root uid 10001, read-only rootfs).
`scan.mjs` reworked so `DRY_RUN` emits a fenced result envelope — that is what
lets the container run with no database credential.

**There is no Docker on the Mac, so `dockerArgs()` has never executed.** Expect
first-contact failures around `--read-only` plus the tmpfs, and non-root plus
git's identity. Verify on the box before trusting it:

```
docker build -t hardener-scanner:latest worker/
docker run --rm --user 10001:10001 --read-only --tmpfs=/tmp:rw,exec \
  -e TARGET_URL=https://github.com/owner/small-repo.git -e DRY_RUN=1 \
  -e HOME=/tmp -e GIT_CONFIG_GLOBAL=/dev/null \
  hardener-scanner:latest node scan.mjs
```


This supersedes both Fly and the Actions runner. From the app's point of view a
Render service and a VPS are identical: an HTTPS endpoint that accepts a signed
job. Same `worker/server.mjs`, same runner branch, one different URL — so this is
a deployment choice, not an architectural one, and it can be changed later with
an env var.

`worker/Dockerfile` already builds the image for either. Add `worker/server.mjs`:

```
POST /scan  { scanId, targetUrl } + HMAC header
   verify signature, check capacity
   respond 202 immediately
   spawn `node scan.mjs` as a CHILD PROCESS

GET  /healthz  200
```

Child process rather than in-process: `scan.mjs` calls `process.exit()` on its
error paths, and one bad scan must not take the service down. Cap parallelism
with `MAX_CONCURRENT_SCANS`, default 1.

> **Proof:** `curl` against the deployed `/scan` with a valid signature returns
> 202 and a findings row lands in Supabase.

#### Host: Render now, a 4 GB VPS before real users (decided 6 Sep 2026)

The host choice is not really Render vs VPS. It is **who chooses the repository
being scanned**, and that changes at a known moment.

**Stage 1 — Render, while you are the one testing.** No hostile-repo threat
exists when you pick the targets yourself, so the isolation work is not yet
earning its keep. Small test repositories will not trouble 512 MB the way a large
one would. Managed patching and restarts are worth more at this stage than
control is.

*Correction to an earlier draft of this plan:* Render does **not** give each scan
a disposable container. That was true of the original Fly design, where every
scan got its own ephemeral machine. On Render, `server.mjs` and the scan share one
long-running container, so untrusted code still runs beside the keys. Render moves
isolation off the host OS; it does not provide it.

**Stage 2 — a 4 GB VPS, before anyone else can paste a URL.** The moment a
stranger picks the target, per-scan containers stop being optional, and that needs
a box you control. 4 GB is comfortable: `semgrep --config auto` peaks around
1–2 GB on a mid-size repository.

- **`MAX_CONCURRENT_SCANS=1` to start.** Raise it only after measuring a real
  scan's peak. Two concurrent scans on 4 GB is plausible, not proven.
- **Add 2 GB of swap.** It turns a memory spike into a slow scan rather than a
  killed process — the OOM killer will not pick the process you would have.
- **≥40 GB disk.** Shallow clones plus scanner caches add up.
- **Not the SportCrawl box.** See below.

The migration between stages is a URL and an env var, because `worker/server.mjs`
is identical on both. Do not spend more decision time on this than that fact
warrants.

**The non-negotiable if you use a VPS.** Hardener clones code it does not trust
and then *runs* it — `validate.mjs` executes tests an AI wrote, inside a
stranger's repository. That is arbitrary code execution by design. On Render each
scan sits in a disposable container. On a VPS, running scans directly on the host
means a hostile repository can take the whole box — **and that box holds
`SUPABASE_SERVICE_KEY` and `GEMINI_API_KEY`.**

So on a VPS, each scan runs in its own container and is destroyed afterwards:
`docker run --rm`, non-root, dropped capabilities, no more network than the clone
needs. The Dockerfile becomes a per-scan sandbox rather than a deploy artifact.

#### The credential boundary — the part the container changes

`validate.mjs:41` hands the generated test an allow-listed environment: `PATH`,
`HOME`, `LANG`, `TMPDIR`. That stops an accidental leak. It does **not** stop a
deliberate one — the test runs as the same user, in the same container, as the
process holding `SUPABASE_SERVICE_KEY` and `GEMINI_API_KEY`, so
`/proc/<parent>/environ` is readable. The allow-list is necessary and not
sufficient once the threat model is a hostile repository rather than a sloppy one.

**The container should never hold the Supabase key, and the mechanism already
exists.** This applies on Render too — more so, because per-scan containers are
not available there, so keeping the key out of the scan process is the primary
defence rather than the second one. Doing it now also makes the Stage 1 → Stage 2
migration a pure URL swap. `DRY_RUN=1` makes `scan.mjs` print `{ total, confirmed, findings }` to
stdout instead of writing to Supabase. So:

```
server.mjs (host, holds the keys)
  → docker run --rm  (no SUPABASE_SERVICE_KEY, DRY_RUN=1)
  → capture stdout JSON
  → server.mjs writes the findings to Supabase
```

Cost: per-finding progress updates no longer come from inside the scan, so
`server.mjs` writes coarse progress instead (claimed → running → done). That is
an acceptable trade for a container that cannot exfiltrate a service-role key.

**End state:** move the AI verify step to the host too, and the container holds
no credential at all — it only clones, runs scanners, and runs tests. In
`VERIFIER=none` mode (Part 2) that is already true on day one, which is another
reason to ship the deterministic product first.

> **Proof:** `env` inside a running scan container shows no Supabase or Gemini
> value, and a findings row still lands.

**Not on the SportCrawl box.** That is one VPS with no fallback. A scan eating
2 GB starves the betting jobs on a good day; on a bad day a hostile repository
takes both projects at once. Separate machine.

> **Proof:** a scan of a repository containing a deliberately hostile test file
> cannot read the host's environment variables or touch anything outside its
> container, and the container is gone afterwards.

### 1.4 `RUNNER=service`, separating retryable from terminal ✅ BUILT 6 Sep

Signed dispatch in `src/lib/runner.ts`; `RunnerBusyError` leaves the scan
`Queued` and answers 503 so QStash retries, while a terminal fault still fails
it with a reason.


One more branch in `src/lib/runner.ts` — call it `service`, since Render and a
VPS are the same thing behind a URL. A correction to what shipped in 0.3: it
treats *any* dispatch failure as Failed. A cold Render instance takes roughly 50
seconds to wake, and that must not kill a scan. (On an always-on VPS this matters
less, but a restart or a deploy produces the same window.)

- **Retryable** — timeout, 502, 503. Leave the scan `Queued` and let QStash
  retry with backoff.
- **Terminal** — 401, missing configuration. Fail immediately with the reason;
  no retry will conjure a secret.

This is the one real argument for keeping QStash in the chain rather than
calling Render directly.

> **Proof:** a scan dispatched to a cold service completes on retry, and the row
> never shows Failed in between.

### 1.5 Deploy configuration

- **Scanner host** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`,
  `SCANNER_SHARED_SECRET`. On Render via `render.yaml`; on a VPS via an env file
  readable only by the service user, never baked into the image.
- **Vercel** — the ~20 vars `src/lib/env.ts` fail-fasts on, plus `RUNNER=service`
  and the scanner URL and shared secret.
- **Supabase** — done (0.5).

> **Proof:** `envReport()` returns `ok: true` in the deployed environment, and a
> scan queued from the live site completes.

### 1.6 Repository access: public and private

**Public repos work today.** `worker/sources.mjs:25` does `git clone --depth 1`
with no credentials. Nothing more is needed once 1.1 lands.

**Private repos have no path at all.** There is no GitHub OAuth anywhere in the
app, no per-user tokens, and `cloneRepo` cannot authenticate.

**Do it with a GitHub App, not OAuth.** This is what Snyk, Dependabot, Renovate
and CodeQL all use, for reasons that matter here:

- The user installs it and **picks which repos** it can see. Nothing else is
  reachable.
- You exchange an app JWT for an **installation token scoped to that
  installation, valid one hour**. No long-lived customer credential sits in the
  database waiting to be breached — which, for a security product, is the
  difference between a bad day and an extinction event.
- The user revokes it from GitHub's own settings without asking you.
- PRs come from **Hardener**, not from you. That fixes 1.2 at the root rather
  than patching around it.

It also reuses a concept already in the product: **installation is the
authorization proof for repos, exactly as DNS-TXT is for domains.** Same check
in `/api/scan` — is there an installation for this user covering this repo?

*Stopgap:* a fine-grained PAT, read-only, single repo, pasted by the user and
stored encrypted. Faster to build, still a stored customer credential. A bridge,
not a destination.

*Avoid plain OAuth.* It hands you a broad, long-lived token covering every repo
the user can see. Storing those is the liability the App exists to avoid.

**Three operational rules once private repos are real:**

1. **Never put the token in the clone URL.** It lands in `ps` output, in the
   saved git remote, and in any error you log. Use
   `git -c http.extraheader="Authorization: Basic <b64>" clone`, or a credential
   helper.
2. **Wipe the checkout.** `scan.mjs` already does `rmSync` in a `finally`. Keep
   that invariant when adding `server.mjs`, and make sure a crash in the child
   still gets the directory cleaned by the parent.
3. **Private source is sent to Gemini.** Every snippet in the verify prompt is
   customer code leaving your infrastructure for a third party. You must
   disclose it, and you **must use a paid API key** — the free tier may use
   inputs for training, which is fine for a benchmark of public CVEs and
   unacceptable for a customer's private source.

> **Proof:** a private repo the user has installed the App on clones and scans;
> a private repo they have not returns 403; no token appears in any log or in
> the checkout's git remote.

### 1.7 Show the cold start instead of hiding it

The dashboard must distinguish `Queued` from `Running` and say *"starting the
scanner — the first scan of the day takes about a minute."* A new user watching
a silent spinner for 50 seconds concludes the product is broken, and they are
not wrong to.

> **Proof:** someone who has never seen the product runs a scan without asking
> whether it is working.

### The sizing risk to settle before committing (Render only)

A VPS with 2 GB+ makes this section moot; it applies if you choose Render.
Render's free tier is roughly 512 MB of RAM and spins down when idle.
**Semgrep with `--config auto` will very likely exhaust that.** In order of
preference:

- Pin explicit rulesets (`p/security-audit`, `p/secrets`) instead of `auto`.
  Less memory, no rule download, and reproducible across runs.
- Pass `--max-memory` and `--jobs 1`.
- Refuse repositories over a size threshold before cloning.
- Keep the service warm with a `/healthz` ping every 10 minutes — about 730 of
  the 750 free hours, and it removes the cold start entirely.

Confirm Render's current limits directly. The figures above are from May 2026.

---

## Part 2 — The product that works without a key

Every claim in this part is deterministic. None of it waits on Part 3, none of
it can hallucinate, and it is the half of Hardener that can honestly say a
defect was repaired.

### 2.1 Stop paying a model to second-guess a database

`worker/scan.mjs:76` merges Semgrep, Gitleaks and osv-scanner into one list and
sends *every* entry to Gemini asking whether it is a real vulnerability.

An osv-scanner finding is a database lookup. A package version either is or is
not in the OSV advisory database. There is no judgment to make — and the model
can answer `is_vulnerability: false` and delete a confirmed CVE from the user's
report. The same largely holds for Gitleaks: a leaked key is a leaked key.

Route advisory and secret findings *around* the verifier. They are facts, not
candidates.

> **Proof:** a scan of a repository with a known-vulnerable lockfile reports that
> CVE with zero model calls.

### 2.2 `VERIFIER=none|gemini`, defaulting to none

Ships today, costs nothing, needs no key. Semgrep hits are reported as
*findings* rather than verdicts — no inference, no fabricated confidence, no
invented severity. Score derives from CVSS on confirmed advisories instead of AI
verdicts.

This is also the cleanest form of the privacy claim in 1.6: with
`VERIFIER=none`, private repository scanning sends nothing anywhere, and "your
code never leaves our scanner" becomes something you can put on the pricing page.

> **Proof:** a full scan completes with `GEMINI_API_KEY` unset and produces a
> report with no empty or misleading fields.

### 2.3 Deterministic fixes, proven by execution

A dependency CVE has a known fixed version, so the patch is a version bump.
Generated mechanically: no model, no hallucination, no malformed diff, none of
the `-p0`/`--recount` problems that consumed 0.2.

Then it gets proven, and this is where the existing architecture wins. Gates 2
and 3 failed because a *model* wrote the test. For a dependency bump you do not
need a generated test — there are two better signals, both free:

- **The scanner is the test.** osv-scanner reports the advisory before the bump
  and does not after. Fail-before / pass-after, deterministic.
- **The repository's own suite is the regression check.** Green before, green
  after, proving the bump broke nothing.

Implementation note: switch osv-scanner to `--format json`. The SARIF output
does not reliably carry the fixed version, and the bump cannot be built without
it.

> **Proof:** `patch_validated: true` on a real advisory, where the CVE is gone
> and the suite still passes. The first honest `true` this column has held.

### What this gives up, plainly

Subtle logic vulnerabilities are lost — the `requests` netrc leak, the ReDoS.
Semgrep scored an F1 of 0.125 on those and no amount of pipeline work changes
it. Say so on the page rather than letting a customer discover it.

It also moves nearer Dependabot, Renovate and Snyk. The angle against them is
narrow but true: they bump everything and let CI sort it out; Hardener bumps
only what carries a live advisory and hands back proof that the CVE is gone and
nothing broke.

---

## Part 3 — The experiment worth paying for

### Why this is the experiment

Hardener's verifier is a **filter** over scanner output. It can only ever remove
findings, never add them — so Semgrep's recall is a hard ceiling on Hardener's
recall.

Semgrep raised **zero** findings inside the vulnerable file for 13 of 15 CVE
tasks. On those the model is never shown the bug and cannot flag it at any
price. Canary reached an F1 of 0.50 on the same tasks by handing the model a
whole *file* and asking it to hunt. That number belongs to an architecture this
worker does not have.

| Arm | Precision | Recall | F1 | Fix rate |
|---|---:|---:|---:|---:|
| Semgrep alone, repo-wide | 0.200 | 0.091 | 0.125 | — |
| Semgrep alone, scoped to the file | 0.000 | 0.000 | 0.000 | — |
| Canary AI, gemini-3.5-flash | 0.556 | 0.455 | 0.500 | **0** |
| Canary AI, gemini-3.7-flash | 0.333 | 0.182 | 0.235 | **0** |

### 3.1 Grow the corpus to 40+ before spending anything (free)

Pure git ingestion through `tools/build_real_tasks.py`, no model calls. Add
roughly 15 JavaScript and TypeScript CVE tasks — the corpus is entirely Python
while Hardener's market is mostly JS — plus 8 more clean controls. An expert
reviewer will raise statistical power against n=15, and this is the answer.

> **Proof:** 40+ tasks with clean controls, every one reproducible from a git ref.

### 3.2 Files in, not SARIF rows in (~$25)

Three arms on the same corpus: the current ±15-line window, whole file, and the
agentic shape that reads files and runs the test itself. Measure detection and
execution-backed fix rate on all three.

Enforce the ceiling with Canary's `budget.py`, which blocks a call *before*
sending when the estimate exceeds the remaining balance.

> **Proof:** a complete run across all 40 tasks. Partial coverage is not a
> comparable score, and the harness already refuses to report one.

### 3.3 The decision gate

If fix rate stays at zero across 40 cases, stop building remediation and ship
proven triage. Decide that now, while it is a plan rather than a sunk cost.

Either outcome is sellable. *"Everyone ships autofix; we ran real CVEs and
measured that it repairs nothing, so we are the layer that runs the test before
and after"* is a pitch that works at a fix rate of zero — and no competitor has
published the number, because they are the ones with the budget to measure it.

> **Proof:** a number, on 40 cases, that a stranger can reproduce from the repo.

---

## Cost

Derived from 120 recorded Canary calls averaging 8,320 input and 2,825 output
tokens, priced at gemini-2.5-flash rates ($0.30 / $2.50 per million). The entire
prior evaluation campaign cost **$2.47**, so roughly **$0.0096 per call**.

| Item | What it buys | Cost |
|---|---|---:|
| Parts 0–2 | Working product, new-user path, deterministic fixes | $0 |
| Corpus to 40+ | A benchmark that survives review | $0 |
| One live demo scan | First end-to-end run this project has ever had | $0.25 |
| Files-in experiment | Whether recall clears the Semgrep ceiling | ~$25 |
| **Total** | Product shipped and the core question answered | **~$25** |

Steady-state unit economics matter more than the research budget. A single-shot
production scan of 25 findings costs about **$0.38**; the agentic arm costs
roughly **$2.50**. If the agentic arm is the only one that works, a $29/month
tier with 20 scans runs about $50 of cost. Model that before setting a price.

---

## Order of work

1. **1.1 + 1.2 together** — the blocker and the hole it opens. Nothing else
   matters until a stranger can scan a repo without your GitHub account being
   usable as a weapon.
2. **1.3 → 1.5** — Render, the runner branch, deploy config.
3. **2.1 + 2.2** — cheap, removes the key from the critical path, and makes the
   privacy claim in 1.6 true.
4. **1.6** — GitHub App, once there is a product worth installing it for.
5. **2.3** — the first honest `patch_validated: true`.
6. **3.1** — free, and it is the prerequisite for spending anything.
7. **3.2 → 3.3** — the ~$25 and the decision.

Parts 1 and 2 do not depend on Part 3. A working, honest product ships before
any money is spent.
