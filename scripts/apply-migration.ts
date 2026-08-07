import { readFile } from "node:fs/promises";
import postgres from "postgres";

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const migrationName = process.argv[2] ?? "0001_initial.sql";

  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD is required");
  }
  if (
    !/^[a-zA-Z0-9_-]+\.sql$/.test(migrationName) ||
    migrationName.includes("..")
  ) {
    throw new Error(
      "Migration must be a SQL filename from supabase/migrations",
    );
  }

  const sql = postgres({
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    username: "postgres.ovvezqqdkqcqselwulvl",
    password,
    ssl: "require",
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
  });

  try {
    const migration = await readFile(
      new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
      "utf8",
    );

    await sql.unsafe(migration);

    const [verification] = await sql<
      {
        movies: string | null;
        pgroonga: boolean;
      }[]
    >`
      select
        to_regclass('public.movies')::text as movies,
        exists (
          select 1 from pg_extension where extname = 'pgroonga'
        ) as pgroonga
    `;

    if (!verification?.movies || !verification.pgroonga) {
      throw new Error("Migration verification failed");
    }

    console.log(`${migrationName} and database verification succeeded.`);
  } finally {
    await sql.end();
  }
}

void main();
