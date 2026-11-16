import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePath, normalizeStack, scrubText } from "../src/lib/ingest/scrub";
import { batchSchema, normalizeEvent } from "../src/lib/ingest/contract";

describe("scrubText", () => {
  it("masks e-mails", () => {
    assert.equal(scrubText("gửi thư cho me.be+1@gmail.com lỗi"), "gửi thư cho [an] lỗi");
    assert.equal(scrubText("to: Ba_Me@example.com.vn"), "to: [an]");
  });

  it("masks Vietnamese and international phone numbers", () => {
    assert.equal(scrubText("SĐT 0912345678 sai"), "SĐT [an] sai");
    assert.equal(scrubText("gọi +84 912 345 678"), "gọi [an]");
    assert.equal(scrubText("84912345678"), "[an]");
    assert.equal(scrubText("0912.345.678"), "[an]");
    assert.equal(scrubText("call +1 415 555 0100"), "call [an]");
  });

  it("does not mask ordinary numbers, versions, code locations", () => {
    assert.equal(scrubText("HTTP 500 after 1200ms"), "HTTP 500 after 1200ms");
    assert.equal(scrubText("phiên bản 2.51.0"), "phiên bản 2.51.0");
    assert.equal(scrubText("worker.js:1234:56"), "worker.js:1234:56");
    assert.equal(scrubText("D1_ERROR: too many rows (5000)"), "D1_ERROR: too many rows (5000)");
  });

  it("masks token-like strings", () => {
    assert.equal(scrubText("Authorization: Bearer abc.def-123_xyz"), "Authorization: Bearer [an]");
    assert.equal(scrubText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF123_-x"), "jwt [an]");
    assert.equal(scrubText("key re_FAKE0000example"), "key [an]");
    assert.equal(scrubText("tm_FAKEFAKE0000000000example"), "[an]");
    assert.equal(scrubText("token=abcd1234 next"), "token=[an] next");
    assert.equal(scrubText('api_key: "fake-value"'), "api_key: [an]");
    assert.equal(scrubText("id a8Kd93jLm2Qp0zXv7Rt5Yw1N"), "id [an]");
  });

  it("removes query strings and fragments", () => {
    assert.equal(
      scrubText("fetch https://example.com/api/app/buoi?ph_id=12&token=x failed"),
      "fetch https://example.com/api/app/buoi failed",
    );
    assert.equal(scrubText("GET /api/app/buoi/12?be_id=3#top"), "GET /api/app/buoi/12");
  });
});

describe("normalizeStack", () => {
  it("keeps only file:line:col", () => {
    const stack = [
      "TypeError: x is undefined",
      "    at napThe (https://example.com/app.js?v=2.51.0:10:5)",
      "    at async Object.fetch (worker.js:200:17)",
      "taiBa@https://example.com/app.js:33:9",
    ].join("\n");
    assert.deepEqual(normalizeStack(stack), [
      "https://example.com/app.js:10:5",
      "worker.js:200:17",
      "https://example.com/app.js:33:9",
    ]);
  });
  it("returns null when nothing parses", () => {
    assert.equal(normalizeStack("no frames here"), null);
  });
});

describe("normalizePath", () => {
  it("templates ids and drops query", () => {
    assert.equal(normalizePath("/api/app/buoi/123?x=1"), "/api/app/buoi/:id");
    assert.equal(
      normalizePath("https://example.com/api/app/be/550e8400-e29b-41d4-a716-446655440000/the"),
      "/api/app/be/:id/the",
    );
    assert.equal(normalizePath("/api/app/buoi/:id"), "/api/app/buoi/:id");
  });
});

describe("contract", () => {
  const base = {
    ma_su_kien: "evt_0001abcd",
    thoi_gian: "2026-11-16T10:00:00.000Z",
    moi_truong: "thu",
    nguon: "may-chu",
    phien_ban: "2.51.0",
    loai_loi: "HTTP 500",
    thong_diep: "Lỗi khi gửi thư cho a@b.com",
    duong_dan: "/api/app/buoi/42?ph_id=7",
  };

  it("rejects fields outside the allow-list", () => {
    assert.equal(batchSchema.safeParse({ ...base, ip: "1.2.3.4" }).success, false);
    assert.equal(batchSchema.safeParse({ ...base, user_agent: "x" }).success, false);
    assert.equal(batchSchema.safeParse({ su_kien: [base], extra: 1 }).success, false);
  });

  it("accepts a single event, an array and { su_kien: [] }", () => {
    assert.ok(batchSchema.safeParse(base).success);
    assert.ok(batchSchema.safeParse([base, base]).success);
    assert.ok(batchSchema.safeParse({ su_kien: [base] }).success);
  });

  it("normalizes and scrubs", () => {
    const e = normalizeEvent(base, new Date("2026-11-16T10:00:05Z"));
    assert.equal(e.message, "Lỗi khi gửi thư cho [an]");
    assert.equal(e.path, "/api/app/buoi/:id");
    assert.equal(e.kind, "error");
    assert.equal(e.environment, "thu");
  });

  it("truncates thong_diep to 300 chars", () => {
    const e = normalizeEvent({ ...base, thong_diep: "x ".repeat(500) });
    assert.equal(e.message!.length, 300);
  });

  it("groups the same error across releases / line numbers", () => {
    const a = normalizeEvent({ ...base, stack: "at f (app.js:10:5)", phien_ban: "2.51.0" });
    const b = normalizeEvent({ ...base, stack: "at f (app.js:12:9)", phien_ban: "2.52.0", ma_su_kien: "evt_0002abcd" });
    assert.equal(a.fingerprint, b.fingerprint);
  });

  it("uses dau_van_tay when given", () => {
    assert.equal(normalizeEvent({ ...base, dau_van_tay: "abc123" }).fingerprint, "c:abc123");
  });
});
