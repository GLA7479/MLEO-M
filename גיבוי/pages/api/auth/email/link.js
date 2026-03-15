// Next.js API route – DEV: pretend to send an email, but don't.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email } = req.body || {};
    const emailOk = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email);
    if (!emailOk) {
      return res.status(400).json({ ok: false, error: "Invalid email" });
    }

    // DEV: no actual email is sent. In real prod, send Magic Link + OTP here.
    return res.status(200).json({ ok: true, dev: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
