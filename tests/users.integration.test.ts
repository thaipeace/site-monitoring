/**
 * User management (invite links, roles, lock, reset) against a real Postgres.
 *   npm run test:integration
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../src/lib/db";
import { apiTokens, invites, sessions, users } from "../src/lib/db/schema";
import { AccessError } from "../src/lib/services/access";
import { authenticateBearer, createToken } from "../src/lib/services/tokens";
import {
  acceptInvite,
  createInvite,
  createResetLink,
  findInvite,
  listPendingInvites,
  setUserActive,
  setUserRole,
} from "../src/lib/services/users";
import { verifyPassword } from "../src/lib/password";

const run = Math.random().toString(36).slice(2, 8);
const mail = (n: string) => `u${run}-${n}@siroby.com`;
let adminId: string;
const created: string[] = [];

const rejects = (p: Promise<unknown>, msg: RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof AccessError && msg.test(e.message));

before(async () => {
  process.env.ALLOWED_EMAIL_DOMAIN = "siroby.com";
  const [a] = await db.insert(users).values({ email: mail("admin"), name: "Admin", passwordHash: "x", role: "admin" }).returning();
  adminId = a.id;
  created.push(a.id);
});

after(async () => {
  await db.delete(invites).where(like(invites.email, `u${run}-%`));
  await db.delete(users).where(inArray(users.id, created));
  await db.delete(users).where(like(users.email, `u${run}-%`));
  await db.$client.end();
});

describe("invites", () => {
  it("invite → accept creates the user with the invited role, link is single-use", async () => {
    const token = await createInvite(adminId, `  ${mail("Moi").toUpperCase()} `, "member");
    const found = await findInvite(token);
    assert.equal(found?.email, mail("moi"));
    assert.equal(found?.existingName, null);
    assert.ok((await listPendingInvites()).some((i) => i.email === mail("moi")));

    const id = await acceptInvite(token, "Mới", "mat-khau-dai-123");
    created.push(id);
    const [u] = await db.select().from(users).where(eq(users.id, id));
    assert.equal(u.role, "member");
    assert.equal(u.email, mail("moi"));
    assert.ok(await verifyPassword("mat-khau-dai-123", u.passwordHash));

    assert.equal(await findInvite(token), null);
    await rejects(acceptInvite(token, "Lại", "mat-khau-dai-456"), /đã dùng|hết hạn/);
  });

  it("refuses other domains and existing accounts", async () => {
    await rejects(createInvite(adminId, "ai-do@gmail.com", "member"), /@siroby\.com/);
    await rejects(createInvite(adminId, mail("admin"), "member"), /đã có tài khoản/);
  });

  it("a new link replaces the old one; expired links are refused", async () => {
    const t1 = await createInvite(adminId, mail("thay"), "admin");
    const t2 = await createInvite(adminId, mail("thay"), "admin");
    assert.equal(await findInvite(t1), null);
    assert.ok(await findInvite(t2));
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.email, mail("thay")));
    await rejects(acceptInvite(t2, "X", "mat-khau-dai-123"), /hết hạn/);
  });
});

describe("roles, lock, reset", () => {
  let memberId: string;

  before(async () => {
    const [m] = await db.insert(users).values({ email: mail("tv"), name: "TV", passwordHash: "x" }).returning();
    memberId = m.id;
    created.push(m.id);
  });

  it("cannot change own role / lock self; promote & demote others", async () => {
    await rejects(setUserRole(adminId, adminId, "member"), /của mình/);
    await rejects(setUserActive(adminId, adminId, false), /của mình/);
    await setUserRole(adminId, memberId, "admin");
    assert.equal((await db.select().from(users).where(eq(users.id, memberId)))[0].role, "admin");
    await setUserRole(adminId, memberId, "member");
  });

  it("keeps at least one active admin", async () => {
    // Make a second admin, then have them try to demote the only other admin.
    const [other] = await db.insert(users).values({ email: mail("ad2"), name: "Ad2", passwordHash: "x", role: "admin" }).returning();
    created.push(other.id);
    await setUserRole(other.id, adminId, "member"); // fine: `other` is still admin
    await rejects(setUserRole(adminId, other.id, "member"), /ít nhất một quản trị viên/);
    await rejects(setUserActive(adminId, other.id, false), /ít nhất một quản trị viên/);
    await setUserRole(other.id, adminId, "admin");
  });

  it("locking signs the user out, kills pending links and API tokens; unlock restores", async () => {
    await db.insert(sessions).values({ id: `s${run}`, userId: memberId, expiresAt: new Date(Date.now() + 60_000) });
    const token = await createToken(memberId, { name: "agent", scopes: ["read"] });
    assert.equal((await authenticateBearer(`Bearer ${token}`)).userId, memberId);
    const reset = await createResetLink(adminId, memberId);

    await setUserActive(adminId, memberId, false);
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, memberId))).length, 0);
    assert.equal(await findInvite(reset), null);
    await rejects(authenticateBearer(`Bearer ${token}`), /.+/);
    await rejects(createResetLink(adminId, memberId), /khoá/);
    await rejects(createInvite(adminId, mail("tv"), "member"), /Mở khoá/);

    await setUserActive(adminId, memberId, true);
    assert.equal((await authenticateBearer(`Bearer ${token}`)).userId, memberId);
    await db.delete(apiTokens).where(eq(apiTokens.userId, memberId));
  });

  it("reset link sets a new password, keeps role, signs out old sessions", async () => {
    await db.insert(sessions).values({ id: `s2${run}`, userId: memberId, expiresAt: new Date(Date.now() + 60_000) });
    await rejects(createResetLink(adminId, adminId), /Tài khoản/);
    const token = await createResetLink(adminId, memberId);
    assert.equal((await findInvite(token))?.existingName, "TV");
    const id = await acceptInvite(token, "TV mới", "mat-khau-moi-123");
    assert.equal(id, memberId);
    const [u] = await db.select().from(users).where(eq(users.id, memberId));
    assert.equal(u.name, "TV mới");
    assert.equal(u.role, "member");
    assert.ok(await verifyPassword("mat-khau-moi-123", u.passwordHash));
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, memberId))).length, 0);
  });
});
