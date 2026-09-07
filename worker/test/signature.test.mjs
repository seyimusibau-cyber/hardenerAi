// The contract: the app (src/lib/runner.ts, TypeScript, on Vercel) and the
// scanner (server.mjs, on the scan host) must agree on the wire format without
// sharing a line of code. These tests pin that format from both ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { sign, verify } from "../signature.mjs";

const SECRET = "s3cr3t-shared-value";
const BODY = JSON.stringify({ scanId: "abc-123", targetUrl: "https://github.com/o/r.git" });

test("a signature this module produces is one it accepts", () => {
  assert.equal(verify(SECRET, BODY, sign(SECRET, BODY)), null);
});

test("accepts the header src/lib/runner.ts builds", () => {
  // Reproduced literally from dispatchService(), NOT by calling sign() -- the
  // point is to catch the app and the scanner drifting apart.
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(`${ts}.${BODY}`).digest("hex");
  const header = `t=${ts},v1=${sig}`;
  assert.equal(verify(SECRET, BODY, header), null, "app-built header must verify");
});

test("rejects a body that changed after signing", () => {
  const header = sign(SECRET, BODY);
  const tampered = JSON.stringify({ scanId: "abc-123", targetUrl: "https://github.com/attacker/evil.git" });
  assert.equal(verify(SECRET, tampered, header), "bad signature");
});

test("rejects the wrong secret", () => {
  assert.equal(verify("other-secret", BODY, sign(SECRET, BODY)), "bad signature");
});

test("rejects a replayed request once it ages out", () => {
  const old = Date.now() - 10 * 60_000;
  assert.equal(verify(SECRET, BODY, sign(SECRET, BODY, old)), "signature expired");
});

test("rejects a timestamp edited to look fresh", () => {
  // The timestamp is inside the signed material, so moving it forward to defeat
  // the age check invalidates the signature instead.
  const old = Date.now() - 10 * 60_000;
  const header = sign(SECRET, BODY, old);
  const forged = header.replace(/^t=\d+/, `t=${Date.now()}`);
  assert.equal(verify(SECRET, BODY, forged), "bad signature");
});

test("rejects missing and malformed headers rather than throwing", () => {
  assert.equal(verify(SECRET, BODY, undefined), "missing signature");
  assert.equal(verify(SECRET, BODY, ""), "missing signature");
  assert.equal(verify(SECRET, BODY, "garbage"), "malformed signature");
  assert.equal(verify(SECRET, BODY, "t=abc,v1=" + "0".repeat(64)), "malformed signature");
  assert.equal(verify(SECRET, BODY, "t=1,v1=short"), "malformed signature");
  // Uppercase hex is not the format we emit; refuse rather than normalise.
  assert.equal(verify(SECRET, BODY, "t=1,v1=" + "A".repeat(64)), "malformed signature");
});

test("a clock a little ahead is tolerated, a lot is not", () => {
  const soon = Date.now() + 60_000;
  assert.equal(verify(SECRET, BODY, sign(SECRET, BODY, soon)), null);
  const wayAhead = Date.now() + 10 * 60_000;
  assert.equal(verify(SECRET, BODY, sign(SECRET, BODY, wayAhead)), "signature expired");
});
