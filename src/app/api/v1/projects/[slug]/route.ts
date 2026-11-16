import { apiRoute } from "@/lib/api/handler";
import { getProjectAccess } from "@/lib/services/access";
import { listIngestKeys, projectStats } from "@/lib/services/projects";

export const GET = apiRoute<{ slug: string }>(async (actor, _req, { slug }) => {
  const { project, role } = await getProjectAccess(actor, slug);
  const [stats, keys] = await Promise.all([projectStats([project.id]), listIngestKeys(actor, slug)]);
  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      role,
      ...stats.get(project.id),
      alerts: {
        emails: project.alertEmails,
        environments: project.alertEnvironments,
        on_new_issue: project.alertOnNewIssue,
        on_regression: project.alertOnRegression,
        threshold_per_hour: project.alertThresholdPerHour,
        cooldown_minutes: project.alertCooldownMinutes,
      },
    },
    ingest_keys: keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({ environment: k.environment, key_id: k.keyId, last_used_at: k.lastUsedAt })),
  };
});
