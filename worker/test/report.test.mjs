// The contract: a scan that could not assess a finding must never report that
// finding as absent. Both historical failures are pinned here as named cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { completeness } from "../report.mjs";

test("regression: cap above finding count no longer hides a dead verifier", () => {
  // 30 findings raised, MAX_FINDINGS=25, every one of the 25 failed to verify.
  // The old guard compared verifyErrors(25) === total(30), never fired, and the
  // scan completed with confirmed=0, penalty=0, score 100, grade A.
  const c = completeness({ total: 30, assessed: 25, verifyErrors: 25 });
  assert.equal(c.noneVerified, true, "must fail the scan, not report it clean");
  assert.equal(c.truncated, true);
  assert.equal(c.scoreIsPartial, true);
});

test("regression: a dead verifier under the cap still fails the scan", () => {
  const c = completeness({ total: 10, assessed: 10, verifyErrors: 10 });
  assert.equal(c.noneVerified, true);
  assert.equal(c.truncated, false);
});

test("truncation alone makes the score partial", () => {
  // Everything assessed verified fine, but the cap hid 5 findings, so `score`
  // describes a sample -- a big repo must not outscore a small one by overflow.
  const c = completeness({ total: 30, assessed: 25, verifyErrors: 0 });
  assert.equal(c.noneVerified, false);
  assert.equal(c.truncated, true);
  assert.equal(c.scoreIsPartial, true);
  assert.equal(c.verified, 25);
});

test("a partial verify failure is partial, not fatal", () => {
  const c = completeness({ total: 10, assessed: 10, verifyErrors: 3 });
  assert.equal(c.noneVerified, false);
  assert.equal(c.scoreIsPartial, true);
  assert.equal(c.verified, 7);
});

test("a complete clean scan is neither partial nor failed", () => {
  const c = completeness({ total: 10, assessed: 10, verifyErrors: 0 });
  assert.deepEqual(c, { truncated: false, noneVerified: false, scoreIsPartial: false, verified: 10 });
});

test("a repo with no findings is not a failed verification", () => {
  const c = completeness({ total: 0, assessed: 0, verifyErrors: 0 });
  assert.equal(c.noneVerified, false, "nothing to verify is not a verifier failure");
  assert.equal(c.scoreIsPartial, false);
});

test("impossible counts throw rather than silently miscounting", () => {
  assert.throws(() => completeness({ total: 5, assessed: 9, verifyErrors: 0 }));
  assert.throws(() => completeness({ total: 9, assessed: 5, verifyErrors: 7 }));
});
