import crypto from "crypto";

const PENDING = global._PENDING_EMAILS || (global._PENDING_EMAILS = new Map());

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Invalid email" });

  const code = Math.floor(100000 + Math.random()*900000).toString(); // 6 ספרות
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 15*60*1000;
  PENDING.set(email, { code, token, expiresAt });

  // TODO: שליחת מייל אמיתית
  // magic link -> /api/auth/email/magic?email=...&token=...
  console.log(`[DEV] magic link: https://your.site/api/auth/email/magic?email=${encodeURIComponent(email)}&token=${token} | code: ${code}`);
  res.status(200).json({ ok: true });
}
