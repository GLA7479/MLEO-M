import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_V1;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, storageKey: 'v1_auth' },
  realtime: { params: { eventsPerSecond: 20 } },
});
