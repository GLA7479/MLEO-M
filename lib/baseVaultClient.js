import { ensureArcadeDeviceCookie } from "./arcadeDeviceClient";

async function apiFetch(path, options = {}) {
  await ensureArcadeDeviceCookie();

  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Base vault API request failed");
  }
  return payload;
}

export async function getBaseVaultBalance() {
  const payload = await apiFetch("/api/base/vault/balance", { method: "GET" });
  return Math.max(0, Math.floor(Number(payload?.balance || 0)));
}

export async function applyBaseVaultDelta(delta, reason = "mleo-base") {
  const wholeDelta = Math.trunc(Number(delta) || 0);
  if (!wholeDelta) {
    return { ok: true, skipped: true, balance: null };
  }

  const payload = await apiFetch("/api/base/vault/apply", {
    method: "POST",
    body: JSON.stringify({
      delta: wholeDelta,
      reason: String(reason || "mleo-base"),
    }),
  });

  return {
    ok: true,
    balance: Math.max(0, Math.floor(Number(payload?.balance || 0))),
  };
}
