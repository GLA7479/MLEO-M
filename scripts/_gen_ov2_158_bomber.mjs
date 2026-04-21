import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "migrations/online-v2/156_ov2_shared_integrate_snakes.sql"), "utf8");
const start = src.indexOf("CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy");
const leave = src.indexOf("CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room");
const commit = src.lastIndexOf("COMMIT;");
let policy = src.slice(start, leave);
let leaveBody = src.slice(leave, commit);
policy = policy.replace(
  "WHEN 'ov2_community_cards' THEN 'NONE'",
  "WHEN 'ov2_bomber_arena' THEN 'ON_HOST_START'\n    WHEN 'ov2_community_cards' THEN 'NONE'"
);
leaveBody = leaveBody.replace(
  "x_in_snakes_match boolean := false;",
  "x_in_snakes_match boolean := false;\n  x_in_bomber_match boolean := false;"
);
const snakeBlock = `x_in_snakes_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_snakes_and_ladders'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_snakes_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_snakes_seats ss
        WHERE ss.session_id = x_active_session_id
          AND ss.participant_key = x_pk
      );`;
const bomberBlock = `x_in_bomber_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_bomber_arena'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_bomber_arena_seats bs
        WHERE bs.session_id = x_active_session_id
          AND bs.participant_key = x_pk
          AND COALESCE(bs.is_alive, true)
      );

${snakeBlock}`;
if (!leaveBody.includes(snakeBlock)) throw new Error("snake_block not found");
leaveBody = leaveBody.replace(snakeBlock, bomberBlock);
leaveBody = leaveBody.replace(
  "OR x_in_cc_match OR x_in_fh_match OR x_in_gd_match OR x_in_snakes_match THEN",
  "OR x_in_cc_match OR x_in_fh_match OR x_in_gd_match OR x_in_snakes_match OR x_in_bomber_match THEN"
);
leaveBody = leaveBody.replace(
  "ELSIF x_in_snakes_match THEN\n        x_ff := public.ov2_snakes_leave_game(p_room_id, x_pk);",
  "ELSIF x_in_bomber_match THEN\n        x_ff := public.ov2_bomber_arena_leave_or_forfeit(p_room_id, x_pk, true);\n      ELSIF x_in_snakes_match THEN\n        x_ff := public.ov2_snakes_leave_game(p_room_id, x_pk);"
);
const hdr = `-- Canonical shared OV2 integration for Bomber Arena (economy entry policy + leave-room forfeit dispatch).
-- Apply after bomber-arena/163_ov2_bomber_arena_settlement.sql (ov2_bomber_arena_leave_or_forfeit must exist).
-- Does not redefine ov2_qm_* (unchanged from prior migrations).
-- Neutral placement: migrations/online-v2/ root.

BEGIN;

`;
const out = `${hdr}${policy}${leaveBody}\nCOMMIT;\n`;
fs.writeFileSync(path.join(root, "migrations/online-v2/158_ov2_shared_integrate_bomber_arena.sql"), out);
console.log("wrote 158", out.length);
