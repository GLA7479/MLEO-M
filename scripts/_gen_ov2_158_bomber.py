"""One-off generator: build 158_ov2_shared_integrate_bomber_arena.sql from 156 (policy + leave_room only)."""
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
src = (root / "migrations/online-v2/156_ov2_shared_integrate_snakes.sql").read_text(encoding="utf-8")
start = src.find("CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy")
leave = src.find("CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room")
commit = src.rfind("COMMIT;")
policy = src[start:leave]
leave_body = src[leave:commit]
policy = policy.replace(
    "WHEN 'ov2_community_cards' THEN 'NONE'",
    "WHEN 'ov2_bomber_arena' THEN 'ON_HOST_START'\n    WHEN 'ov2_community_cards' THEN 'NONE'",
)
leave_body = leave_body.replace(
    "x_in_snakes_match boolean := false;",
    "x_in_snakes_match boolean := false;\n  x_in_bomber_match boolean := false;",
)
snake_block = """x_in_snakes_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_snakes_and_ladders'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_snakes_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_snakes_seats ss
        WHERE ss.session_id = x_active_session_id
          AND ss.participant_key = x_pk
      );"""
bomber_block = """x_in_bomber_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_bomber_arena'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_bomber_arena_seats bs
        WHERE bs.session_id = x_active_session_id
          AND bs.participant_key = x_pk
          AND COALESCE(bs.is_alive, true)
      );

""" + snake_block
if snake_block not in leave_body:
    raise SystemExit("snake_block not found")
leave_body = leave_body.replace(snake_block, bomber_block)
leave_body = leave_body.replace(
    "OR x_in_cc_match OR x_in_fh_match OR x_in_gd_match OR x_in_snakes_match THEN",
    "OR x_in_cc_match OR x_in_fh_match OR x_in_gd_match OR x_in_snakes_match OR x_in_bomber_match THEN",
)
leave_body = leave_body.replace(
    "ELSIF x_in_snakes_match THEN\n        x_ff := public.ov2_snakes_leave_game(p_room_id, x_pk);",
    "ELSIF x_in_bomber_match THEN\n        x_ff := public.ov2_bomber_arena_leave_or_forfeit(p_room_id, x_pk, true);\n      ELSIF x_in_snakes_match THEN\n        x_ff := public.ov2_snakes_leave_game(p_room_id, x_pk);",
)
hdr = """-- Canonical shared OV2 integration for Bomber Arena (economy entry policy + leave-room forfeit dispatch).
-- Apply after bomber-arena/163_ov2_bomber_arena_settlement.sql (ov2_bomber_arena_leave_or_forfeit must exist).
-- Does not redefine ov2_qm_* (unchanged from prior migrations).
-- Neutral placement: migrations/online-v2/ root.

BEGIN;

"""
out = hdr + policy + leave_body + "\nCOMMIT;\n"
dst = root / "migrations/online-v2/158_ov2_shared_integrate_bomber_arena.sql"
dst.write_text(out, encoding="utf-8")
print("wrote", dst.relative_to(root), "bytes", len(out))
