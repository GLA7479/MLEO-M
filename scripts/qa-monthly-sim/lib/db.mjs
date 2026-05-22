import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./loadEnv.mjs";

loadEnvLocal();

let admin = null;

export function getQaDb() {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY_MP ||
    process.env.SUPABASE_SERVICE_ROLE_MP ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase MP admin env for QA reporting");
  }
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export async function createRun({ mode, seed, monthNumber, label }) {
  const db = getQaDb();
  const { data, error } = await db
    .from("qa_sim_run")
    .insert({
      run_label: label || "monthly-qa",
      mode,
      seed,
      month_number: monthNumber,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishRun(runId, status = "completed") {
  const db = getQaDb();
  await db
    .from("qa_sim_run")
    .update({ ended_at: new Date().toISOString(), status })
    .eq("id", runId);
}
