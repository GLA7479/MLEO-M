import { readSharedVault } from "./sharedVault";
import { ensureArcadeDeviceCookie, ensureCsrfToken, clearCsrfTokenCache } from "./arcadeDeviceClient";

async function refreshVaultSnapshot() {
  try {
    const snapshot = await readSharedVault({ fresh: true });
    return Number(snapshot?.balance || 0);
  } catch {
    return null;
  }
}

async function apiFetch(path, body, retried = false) {
  await ensureArcadeDeviceCookie();
  let csrfToken = await ensureCsrfToken();

  let response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });

  // Retry once on 403 (not based on message text)
  if (response.status === 403 && !retried) {
    clearCsrfTokenCache();
    await ensureArcadeDeviceCookie();
    csrfToken = await ensureCsrfToken(true);

    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
  }

  let payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      success: false,
      message: payload?.message || "Arcade API request failed",
    };
  }

  return payload;
}

export async function startPaidArcadeSession(gameId, stake) {
  const wholeStake = Math.max(0, Math.floor(Number(stake) || 0));
  if (wholeStake <= 0) {
    return { success: false, message: "Invalid stake" };
  }

  const result = await apiFetch("/api/arcade/session/start", {
    gameId,
    stake: wholeStake,
    freeplay: false,
  });
  if (!result?.success) return result;
  const balanceAfter = await refreshVaultSnapshot();

  return {
    success: true,
    sessionId: result?.sessionId || null,
    balanceAfter: balanceAfter ?? Number(result?.balanceAfter || 0),
    stake: Number(result?.stake || wholeStake),
    gameId: result?.gameId || gameId,
    mode: result?.mode || "paid",
    status: result?.status || "started",
  };
}

export async function startFreeplayArcadeSession(gameId) {
  const result = await apiFetch("/api/arcade/session/start", {
    gameId,
    freeplay: true,
  });
  if (!result?.success) return result;

  return {
    success: true,
    sessionId: result?.sessionId || null,
    remainingTokens: Number(result?.remainingTokens || 0),
    amount: Number(result?.amount || 0),
    gameId: result?.gameId || gameId,
    mode: result?.mode || "freeplay",
    status: result?.status || "started",
  };
}

export async function finishArcadeSession(sessionId, payload = {}) {
  if (!sessionId) {
    return { success: false, message: "Missing session id" };
  }

  const result = await apiFetch("/api/arcade/session/finish", {
    sessionId,
    payload,
  });
  if (!result?.success) return result;
  const balanceAfter = await refreshVaultSnapshot();

  return {
    success: true,
    sessionId: result?.sessionId || sessionId,
    approvedReward: Number(result?.approvedReward || 0),
    balanceAfter: balanceAfter ?? Number(result?.balanceAfter || 0),
    status: result?.status || "finished",
    serverPayload: result?.serverPayload || {},
  };
}
