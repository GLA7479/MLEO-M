// pages/api/poker/ping.js
export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  // Log request for debugging
  console.log('REQ /api/poker/ping:', { query: req.query });
  
  res.status(200).json({ 
    ok: true, 
    query: req.query || null, 
    rt: "node",
    timestamp: new Date().toISOString()
  });
}
