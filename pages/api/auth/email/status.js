// Next.js API route – DEV: read the verification cookie
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ verified: false, error: "Method not allowed" });
  }

  try {
    const cookie = req.headers.cookie || "";
    // super tiny parser for our single cookie
    const verified =
      cookie.split(";").some((c) => c.trim().startsWith("mleo_verified=")) &&
      /mleo_verified=1/.test(cookie);

    return res.status(200).json({ verified });
  } catch {
    return res.status(200).json({ verified: false });
  }
}
