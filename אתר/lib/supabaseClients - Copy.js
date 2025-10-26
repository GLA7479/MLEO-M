// lib/supabaseClients.js
import { createClient } from '@supabase/supabase-js';

// HMR-safe singletons
const MP_KEY = '__sb_mp__';
export const supabaseMP = (() => {
  if (typeof globalThis !== 'undefined' && globalThis[MP_KEY]) return globalThis[MP_KEY];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MP;
  const client = createClient(url, key, { 
    auth: { persistSession: true, storageKey: "mp_auth" },
    realtime: { params: { eventsPerSecond: 8 } }
  });
  if (typeof globalThis !== 'undefined') globalThis[MP_KEY] = client;
  return client;
})();

const V1_KEY = '__sb_v1__';
export const supabaseV1 = (() => {
  if (typeof globalThis !== 'undefined' && globalThis[V1_KEY]) return globalThis[V1_KEY];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_V1 || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1 || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { 
    auth: { persistSession: true, storageKey: "v1_auth" },
    realtime: { params: { eventsPerSecond: 8 } }
  });
  if (typeof globalThis !== 'undefined') globalThis[V1_KEY] = client;
  return client;
})();

// stable client id per browser
export function getClientId() {
  if (typeof window === 'undefined') return null;
  try {
    const KEY = 'mp_client_id';
    let v = localStorage.getItem(KEY);
    if (!v) { 
      // יצירת UUID פשוט ללא חבילה חיצונית
      v = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem(KEY, v); 
    }
    return v;
  } catch { return null; }
}