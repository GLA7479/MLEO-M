/**
 * One-shot generator: transforms migrations/online-v2/ludo/077_ov2_ludo_multiplayer_double_rule8.sql
 * into Snakes & Ladders equivalents (tables + function names + product id + idempotency prefixes).
 *
 * Run from repo root: node scripts/gen-ov2-snakes-double-from-ludo077.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "migrations/online-v2/ludo/077_ov2_ludo_multiplayer_double_rule8.sql");
const out = path.join(root, "migrations/online-v2/snakes-ladders/151_ov2_snakes_ladders_double_rule8_from_ludo077.sql");

let s = fs.readFileSync(src, "utf8");
s = s.replace(/\s*COMMIT;\s*$/i, "");
// Remove the migration transaction BEGIN; from source (header adds a single BEGIN).
s = s.replace(/\nBEGIN;\n\n(?=-- -{10,}\n-- Rule 8)/, "\n\n");

// Strip trailing rematch / open_session / snapshot / persist (not needed for Snakes V1)
const cutMarkers = [
  "\n-- -----------------------------------------------------------------------------\n-- open_session:",
  "\n-- -----------------------------------------------------------------------------\n-- build_client_snapshot:",
  "\n-- -----------------------------------------------------------------------------\n-- build_client_snapshot",
  "\nREVOKE ALL ON FUNCTION public.ov2_ludo_open_session",
];
for (const m of cutMarkers) {
  const i = s.indexOf(m);
  if (i !== -1) {
    s = s.slice(0, i);
    break;
  }
}

const pairs = [
  ["ov2_ludo_rule8_forfeit_committed_stake", "ov2_snakes_ladders_rule8_forfeit_committed_stake"],
  ["public.ov2_ludo_rule8_forfeit_committed_stake", "public.ov2_snakes_ladders_rule8_forfeit_committed_stake"],
  ["public._ov2_ludo_double_rebuild_after_elimination", "public._ov2_snakes_ladders_double_rebuild_after_elimination"],
  ["public._ov2_ludo_double_apply_incremental_lock", "public._ov2_snakes_ladders_double_apply_incremental_lock"],
  ["public.ov2_ludo_offer_double", "public.ov2_snakes_ladders_offer_double"],
  ["public.ov2_ludo_respond_double", "public.ov2_snakes_ladders_respond_double"],
  ["public.ov2_ludo_handle_double_timeout", "public.ov2_snakes_ladders_handle_double_timeout"],
  ["public.ov2_ludo_voluntary_forfeit", "public.ov2_snakes_ladders_voluntary_forfeit"],
  ["public.ov2_ludo_mark_missed_turn", "public.ov2_snakes_ladders_mark_missed_turn"],
  ["public.ov2_ludo_build_client_snapshot", "public.ov2_snakes_ladders_build_client_snapshot"],
  ["public.ov2_ludo_sessions", "public.ov2_snakes_ladders_sessions"],
  ["public.ov2_ludo_seats", "public.ov2_snakes_ladders_seats"],
  [" ov2_ludo_sessions", " ov2_snakes_ladders_sessions"],
  [" ov2_ludo_seats", " ov2_snakes_ladders_seats"],
  ["'ov2_ludo'", "'ov2_snakes_ladders'"],
  ["'ludo_rule8:", "'snakes_rule8:"],
  ["'ludo_rule8_forfeit:", "'snakes_rule8_forfeit:"],
  ["'ludo_double:", "'snakes_double:"],
  ["'kind', 'ludo_double_step'", "'kind', 'snakes_double_step'"],
  ["'ludo_rule8_double_elimination'", "'snakes_rule8_double_elimination'"],
  ["Ludo session", "Snakes session"],
  ["No active Ludo session", "No active Snakes session"],
  ["No Ludo seat", "No Snakes seat"],
  ["this Ludo session", "this Snakes session"],
  ["Not a Ludo room", "Not a Snakes room"],
];

for (const [a, b] of pairs) {
  s = s.split(a).join(b);
}

// Snakes board uses `positions` object, not Ludo `pieces`/`finished` paths.
s = s.replace(
  /\(v_board #- ARRAY\['pieces', (.+?)\]\) #- ARRAY\['finished', \1\]/g,
  (_m, g1) =>
    `jsonb_set(v_board, '{positions}', COALESCE(v_board->'positions','{}'::jsonb) - ${g1}, true)`
);

const header = `-- AUTO-GENERATED from ludo/077_ov2_ludo_multiplayer_double_rule8.sql via scripts/gen-ov2-snakes-double-from-ludo077.mjs
-- Snakes & Ladders: Rule 8 economy + multiplayer double parity (ported naming).
-- Requires 150_ov2_snakes_ladders_shared_game.sql (build_client_snapshot + sessions must exist first).
-- Apply AFTER 150 (151 defines double/forfeit/missed_turn that call into snapshot defined in 150).

BEGIN;

`;

const footer = `
COMMIT;
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + s.trim() + "\n\n" + footer, "utf8");
console.log("Wrote", path.relative(root, out));
