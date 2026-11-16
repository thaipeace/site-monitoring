import "dotenv/config";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// `neon deploy` writes Neon env vars to .env.local when .env does not exist.
config({ path: ".env.local" });

async function main() {
  // Migrations must use a direct (non-pooled) connection.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log(`✓ migrations applied (${new URL(url).hostname})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
