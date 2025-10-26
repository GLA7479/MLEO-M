const PENDING = global._PENDING_EMAILS || (global._PENDING_EMAILS = new Map());
export default async function handler(req, res) {
  const { email, token } = req.query || {};
  const entry = PENDING.get(email);
  if (!entry || entry.token !== token || Date.now() > entry.expiresAt) {
    return res.status(400).send("Invalid or expired link");
  }
  res.setHeader("Set-Cookie", `mleo_email_session=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  PENDING.delete(email);
  res.redirect("/?email=verified");
}
