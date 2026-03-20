import { ensureArcadeDeviceCookie, ensureCsrfToken, clearCsrfTokenCache } from "./arcadeDeviceClient";

async function apiFetch(path, options = {}, retried = false) {
  const deviceInit = await ensureArcadeDeviceCookie();
  if (!deviceInit?.success) {
    return {
      success: false,
      message: deviceInit?.message || "Device not initialized",
      code: "DEVICE_INIT_FAILED",
    };
  }
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

  // Retry on 403 with fresh CSRF token.
  // Note: this can duplicate a request if an endpoint responds 403 mid-flow.
  // Keep as-is for now; build throttling is handled by endpoint rate limits and UI locks.
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
      // Return error payload instead of throwing, so callers can handle it gracefully
      return {
        success: false,
        message: retryPayload?.message || "Base API request failed",
        code: retryPayload?.code || "API_ERROR",
        ...retryPayload,
      };
    }
    
    return retryResponse.json().catch(() => ({}));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Return error payload instead of throwing, so callers can handle it gracefully
    return {
      success: false,
      message: payload?.message || "Base API request failed",
      code: payload?.code || "API_ERROR",
      ...payload,
    };
  }
  return payload;
}

export async function getBaseVaultBalance() {
  const payload = await apiFetch("/api/base/vault/balance", {
    method: "GET",
    cache: "no-store",
  });

  if (!payload?.success) {
    return {
      ok: false,
      balance: null,
      code: payload?.code || "API_ERROR",
      message: payload?.message || "Failed to load vault balance",
    };
  }

  return {
    ok: true,
    balance: Math.max(0, Math.floor(Number(payload?.balance || 0))),
  };
}

export async function applyBaseVaultDelta() {
  return {
    ok: false,
    code: "BASE_VAULT_APPLY_DISABLED",
    message: "BASE vault deltas are disabled. Use atomic BASE action endpoints only.",
    balance: null,
  };
}

export async function getBaseState() {
  return apiFetch("/api/base/state", {
    method: "GET",
    cache: "no-store",
  });
}

// Action APIs
export async function buildBuilding(buildingKey) {
  return apiFetch("/api/base/action/build", {
    method: "POST",
    body: JSON.stringify({ building_key: buildingKey }),
  });
}

export async function setBuildingPowerMode(buildingKey, powerMode) {
  return apiFetch("/api/base/action/toggle-building", {
    method: "POST",
    body: JSON.stringify({
      building_key: buildingKey,
      power_mode: Number(powerMode),
    }),
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

export async function spendFromVault(spendType) {
  return apiFetch("/api/base/action/spend", {
    method: "POST",
    body: JSON.stringify({
      spend_type: spendType,
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

export async function claimBaseMission(missionKey) {
  return apiFetch("/api/base/action/mission-claim", {
    method: "POST",
    body: JSON.stringify({ mission_key: missionKey }),
  });
}

export async function setBaseProfile({ crew_role = null, commander_path = null } = {}) {
  return apiFetch("/api/base/action/profile", {
    method: "POST",
    body: JSON.stringify({
      crew_role,
      commander_path,
    }),
  });
}

export async function claimBaseContract(contractKey) {
  return apiFetch("/api/base/action/contract-claim", {
    method: "POST",
    body: JSON.stringify({ contract_key: contractKey }),
  });
}

export async function sendBasePresence({
  visibilityState = "hidden",
  pageName = "base",
  interacted = false,
  gameAction = false,
} = {}) {
  return apiFetch("/api/base/presence", {
    method: "POST",
    body: JSON.stringify({
      visibility_state: visibilityState,
      page_name: pageName,
      interacted: !!interacted,
      game_action: !!gameAction,
    }),
  });
}
