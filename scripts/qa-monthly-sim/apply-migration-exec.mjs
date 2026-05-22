#!/usr/bin/env node
/** Apply migrations/qa/001_qa_sim_tables.sql via Postgres (reads .env.local only). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { loadEnvLocal, PROJECT_ROOT } from "./lib/loadEnv.mjs";

loadEnvLocal();

const sqlPath = path.join(PROJECT_ROOT, "migrations/qa/001_qa_sim_tables.sql");

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "DATABASE_URL or SUPABASE_DB_URL required in .env.local to apply migration",
      })
    );
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'qa_sim_%'
    order by table_name
  `);
  await client.end();
  console.log(
    JSON.stringify(
      {
        ok: true,
        migration: sqlPath,
        tables: tables.rows.map(r => r.table_name),
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
