// lib/vault.js - Vault management with migration and protection
export const VAULT_KEYS = ['mleo_vault_v2','mleo_vault','vault','mleo_balance','mleo_rush_core_v4'];

export function readVault() {
  if (typeof window === 'undefined') return 0;
  for (const k of VAULT_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (typeof obj === 'number') return obj;                 // תמיכה בגרסאות ישנות
      if (obj && typeof obj.amount === 'number') return obj.amount;
      if (obj && typeof obj.vault === 'number') return obj.vault; // mleo_rush_core_v4 format
    } catch {}
  }
  return 0;
}

export function writeVault(amount) {
  if (typeof window === 'undefined') return;
  // הגנה: לא לכתוב undefined/NaN/שלילי
  const safe = Math.max(0, Number.isFinite(amount) ? amount : readVault());
  localStorage.setItem('mleo_vault_v2', JSON.stringify({ amount: safe, updatedAt: Date.now() }));
}

export function migrateVaultOnce() {
  if (typeof window === 'undefined') return;
  try {
    const MIG = 'mleo_vault_migrated_v2';
    if (localStorage.getItem(MIG)) return;
    const current = readVault();
    writeVault(current);           // שומר בפורמט החדש
    localStorage.setItem(MIG, '1');
  } catch {}
}

// Helper to find old vault keys in localStorage
export function findOldVaultKeys() {
  if (typeof window === 'undefined') return [];
  return Object.entries(localStorage)
    .filter(([k]) => /vault|mleo|coins|balance|token|wallet/i.test(k))
    .map(([k,v]) => [k, v, (()=>{ try{return JSON.parse(v)}catch{return v} })()]);
}
