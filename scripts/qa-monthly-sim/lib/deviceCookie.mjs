import crypto from "crypto";

const DEVICE_COOKIE = "mleo_arcade_device";
const DEVICE_SIG_COOKIE = "mleo_arcade_device_sig";

function getSigningSecret() {
  return (
    process.env.CSRF_SECRET ||
    process.env.ARCADE_DEVICE_COOKIE_SECRET ||
    process.env.SESSION_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "__MLEO_DEV_UNIFIED_SIGNING_PLACEHOLDER_DO_NOT_USE_IN_PROD__"
  );
}

function sign(value) {
  return crypto.createHmac("sha256", getSigningSecret()).update(String(value || "")).digest("hex");
}

/** Deterministic QA device id per persona (traceable, stable across days). */
export function qaDeviceId(personaId) {
  const h = crypto.createHash("sha256").update(`qa-${personaId}-v1`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + h.slice(18, 20),
    h.slice(20, 32),
  ].join("-");
}

export function buildDeviceCookieHeader(deviceId) {
  const sig = sign(deviceId);
  return `${DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; ${DEVICE_SIG_COOKIE}=${encodeURIComponent(sig)}`;
}

export function parseSetCookieHeaders(headers) {
  const jar = {};
  const list = headers.getSetCookie?.() ?? [];
  const raw = list.length ? list : [headers.get("set-cookie")].filter(Boolean);
  for (const line of raw) {
    const parts = String(line).split(";")[0];
    const eq = parts.indexOf("=");
    if (eq <= 0) continue;
    const k = parts.slice(0, eq).trim();
    let v = parts.slice(eq + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    jar[k] = v;
  }
  return jar;
}

export function cookieHeaderFromJar(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
}
