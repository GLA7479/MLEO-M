export function getLegacyVaultDeviceId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("vault_device_id");
  } catch {
    return null;
  }
}

export async function ensureArcadeDeviceCookie() {
  const legacyDeviceId = getLegacyVaultDeviceId();
  const response = await fetch("/api/arcade/device", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legacyDeviceId: legacyDeviceId || null,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to initialize arcade device");
  }

  return response.json().catch(() => ({ success: true }));
}
