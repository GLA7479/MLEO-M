import crypto from "crypto";

function getSigningSecret() {
  return (
    process.env.REQUEST_SIGNING_SECRET ||
    process.env.ARCADE_DEVICE_COOKIE_SECRET ||
    process.env.SESSION_COOKIE_SECRET ||
    ""
  );
}

export function signRequest(body, timestamp) {
  const secret = getSigningSecret();
  if (!secret) return null; // Optional feature
  
  const payload = JSON.stringify(body || {});
  const message = `${timestamp}:${payload}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function validateRequestSignature(req, signature, timestamp) {
  const secret = getSigningSecret();
  if (!secret) return true; // If not configured, skip validation
  
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  // Check timestamp freshness
  if (Math.abs(now - timestamp) > maxAge) {
    return false;
  }
  
  const expected = signRequest(req.body, timestamp);
  return expected === signature;
}
