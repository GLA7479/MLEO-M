// lib/supabaseClients.js
import { createClient } from '@supabase/supabase-js';

// =======================
// MAIN Multiplayer client
// =======================
const MP_KEY = '__sb_mp__';
export const supabaseMP = (() => {
  if (typeof globalThis !== 'undefined' && globalThis[MP_KEY]) return globalThis[MP_KEY];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_MP;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MP;

  if (!url || !key) {
    console.error('[Supabase MP] Missing envs', { hasUrl: !!url, hasKey: !!key });
    throw new Error('Supabase MP env vars missing (URL/ANON KEY). Check your .env.local or Vercel settings.');
  }

  const client = createClient(url, key, {
    auth: { persistSession: true, storageKey: 'mp_auth' },
    realtime: { params: { eventsPerSecond: 8 } },
  });

  if (typeof globalThis !== 'undefined') globalThis[MP_KEY] = client;
  return client;
})();

// =======================
// Legacy / V1 client (optional)
// =======================
const V1_KEY = '__sb_v1__';
export const supabaseV1 = (() => {
  if (typeof globalThis !== 'undefined' && globalThis[V1_KEY]) return globalThis[V1_KEY];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_V1 || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1 || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[Supabase V1] Missing envs, returning null client.');
    return null;
  }

  const client = createClient(url, key, {
    auth: { persistSession: true, storageKey: 'v1_auth' },
    realtime: { params: { eventsPerSecond: 8 } },
  });

  if (typeof globalThis !== 'undefined') globalThis[V1_KEY] = client;
  return client;
})();

// =======================
// Stable client ID per browser
// =======================
export function getClientId() {
  try {
    if (typeof window === 'undefined') {
      // fallback לשרת / בנייה
      return '00000000-0000-0000-0000-000000000000';
    }
    const KEY = 'mp_client_id';
    let v = localStorage.getItem(KEY);
    if (!v) {
      // יצירת UUID פשוט ללא חבילה חיצונית
      v =
        crypto.randomUUID?.() ||
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch (e) {
    console.warn('getClientId error', e);
    return '00000000-0000-0000-0000-000000000000'; // fallback בטוח
  }
}
