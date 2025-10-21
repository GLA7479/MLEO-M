// pages/api/poker/start-hand.js
export const config = { runtime: "nodejs" };

// POST { table_id }
// returns { hand_id, hand_no, dealer_seat, sb_seat, bb_seat, sb, bb }
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id } = req.body || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/start-hand:', { table_id });
  
  if (!table_id) {
    console.log('ERROR: Missing table_id');
    return res.status(400).json({ error:"bad_request", details: "Missing table_id" });
  }
  
  try {
    // Generate a proper UUID for hand_id
    const hand_id = crypto.randomUUID();
    const hand_no = 1;
    
    console.log('Starting hand for table:', table_id, 'hand_id:', hand_id);
    
    res.json({ 
      hand_id, 
      hand_no, 
      dealer_seat: 0, 
      sb_seat: 1, 
      bb_seat: 2, 
      sb: 10, 
      bb: 20 
    });
  } catch(e) {
    console.error('Start hand error:', e);
    res.status(500).json({ error:"server_error", details: e.message });
  }
}
