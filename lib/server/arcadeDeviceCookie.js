import crypto from "crypto";
import { getMleoSigningSecret } from "./mleoSigningSecret";

const DEVICE_COOKIE = "mleo_arcade_device";
const DEVICE_SIG_COOKIE = "mleo_arcade_device_sig";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function randomId() {
  return crypto.randomUUID();
}

function sign(value) {
  return crypto.createHmac("sha256", getMleoSigningSecret()).update(String(value || "")).digest("hex");
}

function parseCookies(req) {
  const raw = req?.headers?.cookie || "";
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    const rawVal = rest.join("=") || "";
    try {
      acc[key] = decodeURIComponent(rawVal);
    } catch {
      acc[key] = rawVal;
    }
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function setCookies(res, cookies) {
  const list = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of list) {
    if (!cookie) continue;
    if (typeof res.appendHeader === "function") {
      res.appendHeader("Set-Cookie", cookie);
    } else {
      const existing = res.getHeader("Set-Cookie");
      const merged = Array.isArray(existing) ? [...existing, cookie] : existing ? [existing, cookie] : [cookie];
      res.setHeader("Set-Cookie", merged);
    }
  }
}

export function ensureArcadeDevice(req, res) {
  const cookies = parseCookies(req);
  const currentDevice = cookies[DEVICE_COOKIE];
  const currentSig = cookies[DEVICE_SIG_COOKIE];
  const allowLegacyMigration =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_LEGACY_DEVICE_MIGRATION === "true";
  const requestedLegacyDeviceId = allowLegacyMigration ? req?.body?.legacyDeviceId : null;

  if (currentDevice && currentSig && currentSig === sign(currentDevice)) {
    return currentDevice;
  }

  const deviceId =
    typeof requestedLegacyDeviceId === "string" && requestedLegacyDeviceId.trim()
      ? requestedLegacyDeviceId.trim()
      : randomId();
  const signature = sign(deviceId);
  const secure = process.env.NODE_ENV === "production";

  setCookies(res, [
    serializeCookie(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "Lax",
      secure,
      maxAge: COOKIE_MAX_AGE,
    }),
    serializeCookie(DEVICE_SIG_COOKIE, signature, {
      httpOnly: true,
      sameSite: "Lax",
      secure,
      maxAge: COOKIE_MAX_AGE,
    }),
  ]);

  return deviceId;
}

export function getArcadeDevice(req) {
  const cookies = parseCookies(req);
  const currentDevice = cookies[DEVICE_COOKIE];
  const currentSig = cookies[DEVICE_SIG_COOKIE];
  if (!currentDevice || !currentSig) return null;
  return currentSig === sign(currentDevice) ? currentDevice : null;
}
