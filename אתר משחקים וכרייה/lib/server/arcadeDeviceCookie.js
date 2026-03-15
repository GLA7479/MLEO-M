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

  if (!secret) {
    throw new Error("Missing ARCADE_DEVICE_COOKIE_SECRET");
  }

  return secret;
}

function randomId() {
  return crypto.randomUUID();
}

function sign(value) {
  const secret = getCookieSecret();
  if (!secret) {
    throw new Error("Missing ARCADE_DEVICE_COOKIE_SECRET");
  }
  return crypto.createHmac("sha256", secret).update(String(value || "")).digest("hex");
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
  const existing = res.getHeader("Set-Cookie") || [];
  const array = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...array, ...cookies]);
}

export function getArcadeDevice(req) {
  const cookies = parseCookies(req);
  const deviceId = cookies[DEVICE_COOKIE];
  const signature = cookies[DEVICE_SIG_COOKIE];

  if (!deviceId || !signature) {
    return null;
  }

  const expectedSignature = sign(deviceId);
  if (signature !== expectedSignature) {
    return null;
  }

  return deviceId;
}

export function ensureArcadeDevice(req, res) {
  const existing = getArcadeDevice(req);
  if (existing) {
    return existing;
  }

  const allowLegacyMigration = process.env.ALLOW_LEGACY_DEVICE_MIGRATION === "true";
  const requestedLegacyDeviceId = allowLegacyMigration ? req?.body?.legacyDeviceId : null;

  const deviceId = requestedLegacyDeviceId || randomId();
  const signature = sign(deviceId);

  setCookies(res, [
    serializeCookie(DEVICE_COOKIE, deviceId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "Strict",
      secure: true,
    }),
    serializeCookie(DEVICE_SIG_COOKIE, signature, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "Strict",
      secure: true,
    }),
  ]);

  return deviceId;
}
