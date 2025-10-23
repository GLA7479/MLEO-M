import { createClient } from "@supabase/supabase-js";

const V1_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_V1;
const V1_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1;

const MP_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
const MP_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MP;

// V1 Client (legacy)
let _supabaseV1;
export function getSupabaseV1(){
  if (_supabaseV1) return _supabaseV1;
  if (typeof window !== 'undefined') {
    _supabaseV1 = window.__supabaseV1 || createClient(V1_URL, V1_KEY);
    window.__supabaseV1 = _supabaseV1;
  } else {
    _supabaseV1 = _supabaseV1 || createClient(V1_URL, V1_KEY);
  }
  return _supabaseV1;
}

// MP Client (multiplayer)
let _supabaseMP;
export function getSupabaseMP(){
  if (_supabaseMP) return _supabaseMP;
  if (typeof window !== 'undefined') {
    _supabaseMP = window.__supabaseMP || createClient(MP_URL, MP_KEY);
    window.__supabaseMP = _supabaseMP;
  } else {
    _supabaseMP = createClient(MP_URL, MP_KEY);
  }
  return _supabaseMP;
}

export const supabaseV1 = getSupabaseV1(); // הפרויקט הישן (חד-שחקן וכו')
export const supabaseMP = getSupabaseMP(); // הפרויקט החדש (Lobby/MP)
