import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { batchSchema, normalizeCount, normalizeEvent, normalizeRequestId } from "../src/lib/ingest/contract";

const base = { ma_su_kien: "abcd1234efgh", thoi_gian: new Date().toISOString(), moi_truong: "dev" };

describe("so_lan", () => {
  it("keeps 1–50, clamps above 50", () => {
    assert.equal(normalizeCount(1), 1);
    assert.equal(normalizeCount(7), 7);
    assert.equal(normalizeCount(50), 50);
    assert.equal(normalizeCount(51), 50);
    assert.equal(normalizeCount(1e9), 50);
  });
  it("drops invalid values (counts as 1)", () => {
    for (const v of [undefined, null, 0, -3, 2.5, NaN, Infinity, "5", true, {}, [3]]) assert.equal(normalizeCount(v), 1, String(v));
  });
  it("is an allowed field: a bad value never fails validation", () => {
    for (const so_lan of [3, 999, -1, "x", null]) assert.ok(batchSchema.safeParse({ ...base, so_lan }).success, String(so_lan));
    assert.equal(normalizeEvent(batchSchema.parse({ ...base, so_lan: 120 }) as typeof base).count, 50);
    assert.equal(normalizeEvent(base).count, 1);
  });
});

describe("ma_yc", () => {
  it("keeps cf-ray ids, drops anything else", () => {
    assert.equal(normalizeRequestId("8f1c2a3b4c5d6e7f-SIN"), "8f1c2a3b4c5d6e7f-SIN");
    for (const v of [undefined, "", "a b", "x@y.com", "8f1c?id=1", "a".repeat(65), 123]) assert.equal(normalizeRequestId(v), null, String(v));
  });
  it("is an allowed field and stays in the event", () => {
    const e = batchSchema.parse({ ...base, ma_yc: "8f1c2a3b4c5d6e7f-SIN" }) as typeof base;
    assert.equal(normalizeEvent(e).requestId, "8f1c2a3b4c5d6e7f-SIN");
    assert.ok(batchSchema.safeParse({ ...base, ma_yc: "lung tung @" }).success);
  });
  it("unknown fields are still rejected", () => {
    assert.equal(batchSchema.safeParse({ ...base, so_lan: 2, ip: "1.2.3.4" }).success, false);
  });
});
