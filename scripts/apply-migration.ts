import { readFile } from "node:fs/promises";
import postgres from "postgres";

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD is required");
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
      new URL("../supabase/migrations/0001_initial.sql", import.meta.url),
      "utf8",
    );

    await sql.unsafe(migration);

    const [verification] = await sql<
      {
        movies: string | null;
        search_movies: string | null;
        pgroonga: boolean;
      }[]
    >`
      select
        to_regclass('public.movies')::text as movies,
        to_regprocedure(
          'public.search_movies(text,text[],text[],integer,numeric,text[],integer,integer,text,boolean)'
        )::text as search_movies,
        exists (
          select 1 from pg_extension where extname = 'pgroonga'
        ) as pgroonga
    `;

    if (!verification?.movies || !verification.pgroonga) {
      throw new Error("Migration verification failed");
    }

    console.log("Supabase migration and PGroonga verification succeeded.");
  } finally {
    await sql.end();
  }
}

void main();
