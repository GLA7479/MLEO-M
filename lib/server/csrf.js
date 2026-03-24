import crypto from "crypto";

const CSRF_COOKIE = "mleo_csrf_token";
const CSRF_HEADER = "x-csrf-token";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function getCsrfSecret() {
  const secret =
    process.env.CSRF_SECRET ||
    process.env.ARCADE_DEVICE_COOKIE_SECRET ||
    process.env.SESSION_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";

  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    if (typeof globalThis !== "undefined" && !globalThis.__mleoWarnedCsrfSecret) {
      globalThis.__mleoWarnedCsrfSecret = true;
      console.warn(
        "[mleo] CSRF_SECRET (or ARCADE_DEVICE_COOKIE_SECRET / SESSION_COOKIE_SECRET) is not set. Using a dev-only placeholder. Set CSRF_SECRET in .env for staging/production."
      );
    }
    return "__MLEO_DEV_CSRF_SECRET_DO_NOT_USE_IN_PROD__";
  }

  throw new Error("Missing CSRF_SECRET");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function signToken(token) {
  return crypto.createHmac("sha256", getCsrfSecret()).update(token).digest("hex");
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

export function generateCsrfToken() {
  const token = generateToken();
  const signature = signToken(token);
  return { token, signed: `${token}.${signature}` };
}

export function validateCsrfToken(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER.toLowerCase()];
  
  if (!cookieToken || !headerToken) return false;
  if (cookieToken !== headerToken) return false;
  
  const [token, sig] = cookieToken.split(".");
  if (!token || !sig) return false;
  
  return signToken(token) === sig;
}

export function setCsrfCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    `${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure;" : ""} Max-Age=${COOKIE_MAX_AGE}`
  ]);
}
