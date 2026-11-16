import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret, signBody, verifySignature } from "../src/lib/secrets";

process.env.KEY_ENCRYPTION_SECRET ??= "test-encryption-secret-0123456789";

describe("HMAC signature", () => {
  const secret = "s3cret";
  const body = '{"ma_su_kien":"abc12345"}';
  const now = 1_800_000_000;

  it("accepts a valid signature, with or without sha256= prefix", () => {
    const sig = signBody(secret, String(now), body);
    assert.deepEqual(verifySignature(secret, String(now), body, sig, now), { ok: true });
    assert.deepEqual(verifySignature(secret, String(now), body, `sha256=${sig}`, now), { ok: true });
  });

  it("rejects a tampered body or a wrong secret", () => {
    const sig = signBody(secret, String(now), body);
    assert.equal(verifySignature(secret, String(now), body + " ", sig, now).ok, false);
    assert.equal(verifySignature("other", String(now), body, sig, now).ok, false);
  });

  it("rejects old or future timestamps (replay window 300s)", () => {
    const ts = String(now - 301);
    assert.equal(verifySignature(secret, ts, body, signBody(secret, ts, body), now).ok, false);
    const fut = String(now + 301);
    assert.equal(verifySignature(secret, fut, body, signBody(secret, fut, body), now).ok, false);
  });
});

describe("secret encryption", () => {
  it("round-trips and uses a random IV", () => {
    const a = encryptSecret("hello");
    const b = encryptSecret("hello");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), "hello");
  });
});
