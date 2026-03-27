-- Solo V2 Quick Flip integrity hardening (minimal activation package)
-- Draft-only migration file. Do NOT execute automatically from tooling.
--
-- Scope:
-- - Enforce at most one active unresolved quick_flip session per player.
-- - Improve latest quick_flip choice_submit lookup used by snapshot logic.
-- - No payout/settlement/stats changes.

-- REQUIRED
-- Enforce one active unresolved quick_flip session per player.
create unique index if not exists uq_solo_v2_quick_flip_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'quick_flip'
    and session_status in ('created', 'in_progress');

-- OPTIONAL (recommended)
-- Speeds up targeted latest choice_submit lookup for quick_flip snapshot/read/submit/resolve flows.
create index if not exists idx_solo_v2_events_quick_flip_choice_submit_latest
  on public.solo_v2_session_events (session_id, id desc)
  where event_type = 'client_action'
    and event_payload @> '{"action":"choice_submit"}'::jsonb;
