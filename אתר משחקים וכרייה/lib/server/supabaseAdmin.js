import { createClient } from "@supabase/supabase-js";

let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY_MP ||
    process.env.SUPABASE_SERVICE_ROLE_MP ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role env for arcade API");
  }

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return supabaseAdmin;
}
