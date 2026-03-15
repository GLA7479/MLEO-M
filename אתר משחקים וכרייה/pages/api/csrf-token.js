import { generateCsrfToken, setCsrfCookie } from "../../lib/server/csrf";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { signed } = generateCsrfToken();
    setCsrfCookie(res, signed);
    return res.status(200).json({ success: true, token: signed });
  } catch (error) {
    console.error("csrf-token failed", error);
    return res.status(500).json({ success: false, message: "Failed to generate CSRF token" });
  }
}
