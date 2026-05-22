#!/usr/bin/env node
/**
 * Prints instructions to apply QA migration (owner runs SQL on current Supabase MP).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const sqlPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations/qa/001_qa_sim_tables.sql"
);

const sql = fs.readFileSync(sqlPath, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      message: "Apply this SQL in Supabase SQL Editor (current MP project):",
      path: sqlPath,
      bytes: sql.length,
      tables: [
        "qa_sim_run",
        "qa_sim_event",
        "qa_sim_session",
        "qa_sim_daily_summary",
        "qa_sim_economy_snapshot",
        "qa_sim_alert",
      ],
    },
    null,
    2
  )
);
