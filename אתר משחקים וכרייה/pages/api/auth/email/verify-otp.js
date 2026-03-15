// Next.js API route – DEV: accept a fixed OTP: 1234
const ONE_MONTH = 60 * 60 * 24 * 30; // seconds

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ verified: false, error: "Method not allowed" });
  }

  try {
    const { otp } = req.body || {};
    if (String(otp || "").trim() === "1234") {
      // Mark session as verified using an HttpOnly cookie on same domain
      res.setHeader("Set-Cookie", [
        // value "1", Lax is enough (same-site); Path=/ for whole app
        `mleo_verified=1; Path=/; Max-Age=${ONE_MONTH}; HttpOnly; SameSite=Lax`,
      ]);
      return res.status(200).json({ verified: true });
    } else {
      return res.status(401).json({ verified: false, error: "Invalid code" });
    }
  } catch (e) {
    return res.status(500).json({ verified: false, error: "Server error" });
  }
}
