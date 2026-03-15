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

  if (!secret) {
    throw new Error("Missing CSRF_SECRET");
  }

  return secret;
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function signToken(token) {
  const secret = getCsrfSecret();
  if (!secret) {
    throw new Error("Missing CSRF_SECRET");
  }
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
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

  if (!cookieToken || !headerToken) {
    return false;
  }

  try {
    const [token, signature] = cookieToken.split(".");
    if (!token || !signature) {
      return false;
    }

    const expectedSignature = signToken(token);
    if (signature !== expectedSignature) {
      return false;
    }

    return token === headerToken;
  } catch {
    return false;
  }
}

export function setCsrfCookie(res, signedToken) {
  res.setHeader(
    "Set-Cookie",
    `${CSRF_COOKIE}=${signedToken}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Strict; HttpOnly; Secure`
  );
}
