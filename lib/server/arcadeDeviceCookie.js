import crypto from "crypto";

const DEVICE_COOKIE = "mleo_arcade_device";
const DEVICE_SIG_COOKIE = "mleo_arcade_device_sig";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getCookieSecret() {
  const secret =
    process.env.ARCADE_DEVICE_COOKIE_SECRET ||
    process.env.SESSION_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";

  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    if (typeof globalThis !== "undefined" && !globalThis.__mleoWarnedArcadeDeviceSecret) {
      globalThis.__mleoWarnedArcadeDeviceSecret = true;
      console.warn(
        "[mleo] ARCADE_DEVICE_COOKIE_SECRET (or SESSION_COOKIE_SECRET / NEXTAUTH_SECRET) is not set. Using a dev-only placeholder so arcade/miners APIs work locally. Set ARCADE_DEVICE_COOKIE_SECRET in .env for staging/production."
      );
    }
    return "__MLEO_DEV_ARCADE_DEVICE_SECRET_DO_NOT_USE_IN_PROD__";
  }

  throw new Error("Missing ARCADE_DEVICE_COOKIE_SECRET");
}

function randomId() {
  return crypto.randomUUID();
}

function sign(value) {
  return crypto.createHmac("sha256", getCookieSecret()).update(String(value || "")).digest("hex");
}

function parseCookies(req) {
  const raw = req?.headers?.cookie || "";
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
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
  const existing = res.getHeader("Set-Cookie");
  const next = Array.isArray(existing)
    ? existing.concat(cookies)
    : existing
      ? [existing].concat(cookies)
      : cookies;
  res.setHeader("Set-Cookie", next);
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
