/**
 * Zero-install local Postgres for development (real Postgres binaries via
 * `embedded-postgres`). Alternative: `docker compose up -d`.
 *
 *   npm run db:dev     # postgres://postgres:postgres@127.0.0.1:5432/site_monitoring
 *                      # data in ./.pg-data
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

async function main() {
  const port = Number(process.env.PG_DEV_PORT ?? 5432);
  const databaseDir = process.env.PG_DEV_DIR ?? "./.pg-data";
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
  });
  const fresh = !existsSync(databaseDir);
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("site_monitoring");
  console.log(`Postgres listening on postgres://postgres:postgres@127.0.0.1:${port}/site_monitoring`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
