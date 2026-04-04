import crypto from "crypto";
import { getMleoSigningSecret } from "./mleoSigningSecret";

const CSRF_COOKIE = "mleo_csrf_token";
const CSRF_HEADER = "x-csrf-token";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function signToken(token) {
  return crypto.createHmac("sha256", getMleoSigningSecret()).update(token).digest("hex");
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

export function generateCsrfToken() {
  const token = generateToken();
  const signature = signToken(token);
  return { token, signed: `${token}.${signature}` };
}

export function validateCsrfToken(req) {
  try {
    const cookies = parseCookies(req);
    const cookieToken = cookies[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER.toLowerCase()];

    if (!cookieToken || !headerToken) return false;
    if (cookieToken !== headerToken) return false;

    const [token, sig] = cookieToken.split(".");
    if (!token || !sig) return false;

    return signToken(token) === sig;
  } catch {
    return false;
  }
}

export function setCsrfCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  const c = `${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure;" : ""} Max-Age=${COOKIE_MAX_AGE}`;
  if (typeof res.appendHeader === "function") {
    res.appendHeader("Set-Cookie", c);
  } else {
    res.setHeader("Set-Cookie", [c]);
  }
}
