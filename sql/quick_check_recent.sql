-- ============================================================================
-- בדיקה מהירה של כל הפעולות האחרונות - שאילתה אחת
-- ============================================================================
-- הרץ את השאילתה הזו כדי לראות את כל הפעולות האחרונות (7 ימים אחרונים)
-- ============================================================================

SELECT 
  'Arcade Game' as operation_type,
  id::text as operation_id,
  device_id as identifier,
  game_id as details,
  mode || ' - ' || status as status_info,
  stake as amount,
  approved_reward as reward,
  COALESCE(finished_at, started_at, created_at) as operation_time,
  created_at
FROM public.arcade_device_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Vault Balance' as operation_type,
  id::text as operation_id,
  device_id as identifier,
  'Balance: ' || balance::text as details,
  'Updated' as status_info,
  balance as amount,
  NULL::bigint as reward,
  COALESCE(updated_at, last_sync_at, created_at) as operation_time,
  created_at
FROM public.vault_balances
WHERE updated_at >= NOW() - INTERVAL '7 days'
   OR created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Poker Session' as operation_type,
  id::text as operation_id,
  room_id::text as identifier,
  'Hand #' || hand_no::text || ' - ' || stage as details,
  stage as status_info,
  pot_total as amount,
  NULL::bigint as reward,
  COALESCE(updated_at, created_at) as operation_time,
  created_at
FROM poker_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Poker Action' as operation_type,
  id::text as operation_id,
  session_id::text as identifier,
  'Seat ' || seat_index::text || ' - ' || action as details,
  action as status_info,
  amount,
  NULL::bigint as reward,
  created_at as operation_time,
  created_at
FROM poker_actions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Roulette Session' as operation_type,
  id::text as operation_id,
  room_id::text as identifier,
  'Spin #' || spin_number::text || ' - ' || stage as details,
  COALESCE(spin_color, stage) as status_info,
  total_bets as amount,
  total_payouts as reward,
  COALESCE(updated_at, created_at) as operation_time,
  created_at
FROM roulette_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Roulette Bet' as operation_type,
  rb.id::text as operation_id,
  rb.session_id::text as identifier,
  COALESCE(rp.player_name, 'Unknown') || ' - ' || rb.bet_type || ' (' || rb.bet_value || ')' as details,
  CASE 
    WHEN rb.is_winner = true THEN 'Won'
    WHEN rb.is_winner = false THEN 'Lost'
    ELSE 'Pending'
  END as status_info,
  rb.amount,
  NULL::bigint as reward,
  rb.created_at as operation_time,
  rb.created_at
FROM roulette_bets rb
LEFT JOIN roulette_players rp ON rb.player_id = rp.id
WHERE rb.created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Roulette Spin' as operation_type,
  id::text as operation_id,
  session_id::text as identifier,
  'Spin #' || spin_number::text || ' - Result: ' || result::text as details,
  COALESCE(color, 'N/A') as status_info,
  NULL::bigint as amount,
  NULL::bigint as reward,
  created_at as operation_time,
  created_at
FROM roulette_spins
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Bingo Session' as operation_type,
  id::text as operation_id,
  room_id as identifier,
  COALESCE(winner_name, 'No winner') || ' - ' || stage as details,
  stage as status_info,
  pot_total as amount,
  NULL::bigint as reward,
  COALESCE(finished_at, started_at, created_at) as operation_time,
  created_at
FROM public.bingo_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Bingo Claim' as operation_type,
  id::text as operation_id,
  session_id::text as identifier,
  claimed_by_name || ' - ' || prize_key as details,
  prize_key as status_info,
  amount,
  amount as reward,
  created_at as operation_time,
  created_at
FROM public.bingo_claims
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'War Session' as operation_type,
  id::text as operation_id,
  room_id::text as identifier,
  'Round #' || round_no::text || ' - ' || stage as details,
  stage as status_info,
  NULL::bigint as amount,
  NULL::bigint as reward,
  created_at as operation_time,
  created_at
FROM war_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Checkers Session' as operation_type,
  id::text as operation_id,
  room_id as identifier,
  stage as details,
  stage as status_info,
  NULL::bigint as amount,
  NULL::bigint as reward,
  COALESCE(updated_at, created_at) as operation_time,
  created_at
FROM public.ck_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

ORDER BY operation_time DESC, created_at DESC
LIMIT 200;
