import { createClient } from "@supabase/supabase-js";

const V1_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_V1;
const V1_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1;

const MP_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
const MP_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MP;

export const supabaseV1 = createClient(V1_URL, V1_KEY); // הפרויקט הישן (חד-שחקן וכו')
export const supabaseMP = createClient(MP_URL, MP_KEY); // הפרויקט החדש (Lobby/MP)
