// lib/supabaseClients.js
import { createClient } from '@supabase/supabase-js';

// ---- MP (Multiplayer) — זה הקליינט שבלאקג'ק משתמש בו ----
const MP_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
const MP_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MP;

export const supabaseMP = createClient(MP_URL, MP_ANON, {
  realtime: { params: { eventsPerSecond: 8 } },
});

// ---- V1 (לפרויקט הישן — אם תרצה להשתמש) ----
const V1_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL_V1 || process.env.NEXT_PUBLIC_SUPABASE_URL;
const V1_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1 || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseV1 = (V1_URL && V1_ANON)
  ? createClient(V1_URL, V1_ANON, { realtime: { params: { eventsPerSecond: 8 } } })
  : null;