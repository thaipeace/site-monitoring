"use server";

import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AccessError, type Actor } from "@/lib/services/access";
import { addComment, markNotificationsRead, setIssueStatus, type StatusAction } from "@/lib/services/issues";
import {
  addMember,
  createIngestKey,
  createProject,
  deleteProject,
  removeMember,
  revokeIngestKey,
  updateProjectSettings,
} from "@/lib/services/projects";
import { createToken, revokeToken } from "@/lib/services/tokens";
import type { ProjectRole } from "@/lib/db/schema";

export type ActionState = { error?: string; ok?: string; secret?: string; keyId?: string; environment?: string } | undefined;

async function actor(): Promise<Actor> {
  const user = await requireUser();
  return { kind: "user", userId: user.id };
}

function fail(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof AccessError) return { error: err.message };
  console.error(err);
  return { error: "Có lỗi xảy ra, thử lại sau" };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on";

/* --------------------------------------------------------------- projects */

export async function createProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug: string;
  try {
    const { project } = await createProject(await actor(), { name: str(form, "name") });
    slug = project.slug;
  } catch (err) {
    return fail(err);
  }
  redirect(`/projects/${slug}/settings?created=1`);
}

export async function updateProjectAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    await updateProjectSettings(await actor(), slug, {
      name: str(form, "name") || undefined,
      alertEmails: str(form, "alertEmails") || null,
      webhookUrl: str(form, "webhookUrl") || null,
      alertEnvironments: form.getAll("alertEnvironments").map(String).join(","),
      alertOnNewIssue: bool(form, "alertOnNewIssue"),
      alertOnRegression: bool(form, "alertOnRegression"),
      alertOnNotification: bool(form, "alertOnNotification"),
      alertThresholdPerHour: Number(str(form, "alertThresholdPerHour")),
      alertCooldownMinutes: Number(str(form, "alertCooldownMinutes")),
      sampleLimitPerHour: Number(str(form, "sampleLimitPerHour")),
      retentionDays: Number(str(form, "retentionDays")),
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: "Đã lưu" };
}

export async function deleteProjectAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (str(form, "confirm") !== slug) return { error: `Gõ "${slug}" để xác nhận` };
  try {
    await deleteProject(await actor(), slug);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

export async function createKeyAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const key = await createIngestKey(await actor(), slug, str(form, "environment"));
    refresh();
    return { ok: "Đã tạo khoá", secret: key.secret, keyId: key.keyId, environment: key.environment };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeKeyAction(slug: string, keyId: string) {
  await revokeIngestKey(await actor(), slug, keyId);
  refresh();
}

export async function addMemberAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const role = (str(form, "role") === "admin" ? "admin" : "member") as ProjectRole;
    await addMember(await actor(), slug, str(form, "email"), role);
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: "Đã thêm thành viên" };
}

export async function removeMemberAction(slug: string, userId: string) {
  await removeMember(await actor(), slug, userId);
  refresh();
}

/* ----------------------------------------------------------------- issues */

export async function issueStatusAction(issueId: string, action: StatusAction) {
  await setIssueStatus(await actor(), issueId, action);
  refresh();
}

export async function commentAction(issueId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    await addComment(await actor(), issueId, str(form, "body"));
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: "Đã gửi" };
}

export async function markReadAction(ids: string[] | "all") {
  await markNotificationsRead(await actor(), ids);
  refresh();
}

/* ----------------------------------------------------------------- tokens */

export async function createTokenAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const days = Number(str(form, "expiresInDays"));
    const token = await createToken(user.id, {
      name: str(form, "name"),
      scopes: form.getAll("scopes").map(String),
      projectId: str(form, "projectId") || null,
      expiresInDays: days > 0 ? days : null,
    });
    refresh();
    return { ok: "Đã tạo token", secret: token };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeTokenAction(tokenId: string) {
  const user = await requireUser();
  await revokeToken(user.id, tokenId);
  refresh();
}
