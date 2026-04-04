/**
 * Single source for HMAC signing used by CSRF tokens and arcade device cookies.
 * Same env var order as legacy `csrf.js` / `arcadeDeviceCookie.js`.
 */

const DEV_PLACEHOLDER = "__MLEO_DEV_UNIFIED_SIGNING_PLACEHOLDER_DO_NOT_USE_IN_PROD__";

function warnDevOnce() {
  if (typeof globalThis === "undefined" || globalThis.__mleoSigningDevWarned) return;
  globalThis.__mleoSigningDevWarned = true;
  console.warn(
    "[mleo] No CSRF_SECRET / ARCADE_DEVICE_COOKIE_SECRET / SESSION_COOKIE_SECRET / NEXTAUTH_SECRET — using dev-only signing placeholder. Set one of these for production.",
  );
}

/** @returns {string} */
export function getMleoSigningSecret() {
  const secret =
    process.env.CSRF_SECRET ||
    process.env.ARCADE_DEVICE_COOKIE_SECRET ||
    process.env.SESSION_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";

  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    warnDevOnce();
    return DEV_PLACEHOLDER;
  }

  if (process.env.MLEO_ALLOW_INSECURE_SIGNING_PLACEHOLDER === "true") {
    if (!globalThis.__mleoInsecureSigningLogged) {
      globalThis.__mleoInsecureSigningLogged = true;
      console.error(
        "[mleo] MLEO_ALLOW_INSECURE_SIGNING_PLACEHOLDER=true — using insecure signing placeholder in production. Remove for real deployments; set CSRF_SECRET or NEXTAUTH_SECRET instead.",
      );
    }
    return DEV_PLACEHOLDER;
  }

  throw new Error(
    "Missing signing secret: set CSRF_SECRET, ARCADE_DEVICE_COOKIE_SECRET, SESSION_COOKIE_SECRET, or NEXTAUTH_SECRET in the server environment (or MLEO_ALLOW_INSECURE_SIGNING_PLACEHOLDER=true only for local smoke tests)",
  );
}
