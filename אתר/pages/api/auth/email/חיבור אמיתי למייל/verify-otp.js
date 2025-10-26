const PENDING = global._PENDING_EMAILS || (global._PENDING_EMAILS = new Map());
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, otp } = req.body || {};
  const entry = PENDING.get(email);
  if (!entry || otp !== entry.code || Date.now() > entry.expiresAt) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }
  res.setHeader("Set-Cookie", `mleo_email_session=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  PENDING.delete(email);
  res.status(200).json({ verified: true });
}
