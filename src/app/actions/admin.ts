"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { AccessError } from "@/lib/services/access";
import { createInvite, createResetLink, revokeInvite, setUserActive, setUserRole, USER_ROLES } from "@/lib/services/users";

export type LinkState = { error?: string; token?: string; email?: string; isReset?: boolean } | undefined;

function fail(err: unknown): { error: string } {
  unstable_rethrow(err);
  if (err instanceof AccessError) return { error: err.message };
  console.error(err);
  return { error: "Có lỗi xảy ra, thử lại sau" };
}

const inviteSchema = z.object({
  email: z.email("Email không hợp lệ"),
  role: z.enum(USER_ROLES),
});

export async function createInviteAction(_: LinkState, form: FormData): Promise<LinkState> {
  try {
    const admin = await requireAdmin();
    const parsed = inviteSchema.safeParse({ email: String(form.get("email") ?? "").trim(), role: form.get("role") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const token = await createInvite(admin.id, parsed.data.email, parsed.data.role);
    refresh();
    return { token, email: parsed.data.email.toLowerCase(), isReset: false };
  } catch (err) {
    return fail(err);
  }
}

export async function createResetLinkAction(userId: string, email: string): Promise<LinkState> {
  try {
    const admin = await requireAdmin();
    const token = await createResetLink(admin.id, userId);
    refresh();
    return { token, email, isReset: true };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInviteAction(inviteId: string) {
  await requireAdmin();
  await revokeInvite(inviteId);
  refresh();
}

export async function setUserRoleAction(userId: string, role: string): Promise<{ error?: string }> {
  try {
    const admin = await requireAdmin();
    const parsed = z.enum(USER_ROLES).safeParse(role);
    if (!parsed.success) return { error: "Vai trò không hợp lệ" };
    await setUserRole(admin.id, userId, parsed.data);
    refresh();
    return {};
  } catch (err) {
    return fail(err);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<{ error?: string }> {
  try {
    const admin = await requireAdmin();
    await setUserActive(admin.id, userId, active);
    refresh();
    return {};
  } catch (err) {
    return fail(err);
  }
}
