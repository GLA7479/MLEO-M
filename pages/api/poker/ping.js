// pages/api/poker/ping.js
export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  res.status(200).json({ 
    ok: true, 
    query: req.query || null, 
    rt: "node",
    timestamp: new Date().toISOString()
  });
}
