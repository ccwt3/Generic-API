import { execSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:17").start();

  // Config hermética: no depende del .env local. Vitest crea los workers
  // después de este setup, así que heredan este env y config/env.ts lo lee
  // al importarse (su dotenv no pisa variables ya presentes).
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.JWT_KEY = "test-jwt-key";
  process.env.JWT_KEY_REFRESH = "test-jwt-key-refresh";
  process.env.COOKIE_KEY = "test-cookie-key";

  // Aplica las migraciones reales del proyecto sobre la DB del contenedor.
  execSync("pnpm exec prisma migrate deploy", {
    env: process.env,
    stdio: "inherit",
  });
}

export async function teardown() {
  await container.stop();
}
