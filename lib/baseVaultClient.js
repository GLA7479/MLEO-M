import { ensureArcadeDeviceCookie, ensureCsrfToken, clearCsrfTokenCache } from "./arcadeDeviceClient";

async function apiFetch(path, options = {}, retried = false) {
  await ensureArcadeDeviceCookie();
  let csrfToken = await ensureCsrfToken();

  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  // Retry on 403 with fresh CSRF token
  if (response.status === 403 && !retried) {
    clearCsrfTokenCache();
    await ensureArcadeDeviceCookie();
    csrfToken = await ensureCsrfToken(true);
    
    const retryResponse = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    
    if (!retryResponse.ok) {
      const retryPayload = await retryResponse.json().catch(() => ({}));
      throw new Error(retryPayload?.message || "Base API request failed");
    }
    
    return retryResponse.json().catch(() => ({}));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Base API request failed");
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

export async function getBaseState() {
  return apiFetch("/api/base/state", { method: "GET" });
}

// Action APIs
export async function buildBuilding(buildingKey) {
  return apiFetch("/api/base/action/build", {
    method: "POST",
    body: JSON.stringify({ building_key: buildingKey }),
  });
}

export async function installModule(moduleKey) {
  return apiFetch("/api/base/action/module", {
    method: "POST",
    body: JSON.stringify({ module_key: moduleKey }),
  });
}

export async function researchTech(researchKey) {
  return apiFetch("/api/base/action/research", {
    method: "POST",
    body: JSON.stringify({ research_key: researchKey }),
  });
}

export async function launchExpedition() {
  return apiFetch("/api/base/action/expedition", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function shipToVault() {
  return apiFetch("/api/base/action/ship", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function spendFromVault(spendType, energyCap = null) {
  return apiFetch("/api/base/action/spend", {
    method: "POST",
    body: JSON.stringify({
      spend_type: spendType,
      ...(energyCap !== null ? { energy_cap: energyCap } : {}),
    }),
  });
}

export async function hireCrewAction() {
  return apiFetch("/api/base/action/crew", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function performMaintenanceAction() {
  return apiFetch("/api/base/action/maintenance", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
