// The shared secret handshake between the app and the scanner.
//
// Extracted from server.mjs so it can be tested. The app builds these headers in
// src/lib/runner.ts, and the two implementations live in different languages and
// different containers — the only thing keeping them compatible is
// test/signature.test.mjs, which pins the exact wire format.
//
// Format: `t=<unix ms>,v1=<hex sha256 hmac>` over `${t}.${body}`.
// The timestamp is inside the signed material, so it cannot be edited, and it
// bounds replay: a captured request stops working once it ages out.
import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(secret, body, ts = Date.now()) {
  const t = String(ts);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Returns null when valid, or a short reason why not. Never throws. */
export function verify(secret, body, header, maxAgeMs = 300_000, now = Date.now()) {
  if (!header) return "missing signature";
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header).trim());
  if (!m) return "malformed signature";
  const [, ts, sig] = m;

  const age = now - Number(ts);
  if (!Number.isFinite(age) || Math.abs(age) > maxAgeMs) return "signature expired";

  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest();
  const given = Buffer.from(sig, "hex");
  // Both are 32 bytes given the regex above; the guard keeps timingSafeEqual
  // from throwing if that ever stops being true.
  if (given.length !== expected.length) return "bad signature";
  if (!timingSafeEqual(given, expected)) return "bad signature";
  return null;
}
