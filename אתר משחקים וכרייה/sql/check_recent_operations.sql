-- ============================================================================
-- בדיקת כל הפעולות האחרונות - משחקים, איסופים וכו'
-- ============================================================================
-- שאילתה מקיפה לבדיקת כל הפעולות האחרונות במערכת
-- כולל: משחקי ארקייד, משחקי מולטיפלייר, שינויים בוולט, איסופים וכו'
-- ============================================================================

-- 1. משחקי ארקייד אחרונים (arcade_device_sessions)
SELECT 
  'Arcade Game' as operation_type,
  id::text as operation_id,
  device_id,
  game_id,
  mode,
  status,
  stake,
  approved_reward,
  (approved_reward - stake) as net_result,
  started_at,
  finished_at,
  created_at,
  updated_at
FROM public.arcade_device_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 2. שינויים בוולט (vault_balances) - איסופים ושינויים אחרונים
SELECT 
  'Vault Balance' as operation_type,
  id::text as operation_id,
  device_id,
  balance as current_balance,
  last_nonce,
  last_sync_at as operation_time,
  created_at,
  updated_at
FROM public.vault_balances
WHERE updated_at >= NOW() - INTERVAL '7 days'
   OR created_at >= NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC, created_at DESC
LIMIT 50;

-- 3. משחקי פוקר אחרונים
SELECT 
  'Poker Session' as operation_type,
  id::text as operation_id,
  room_id::text,
  hand_no,
  stage,
  pot_total,
  created_at,
  updated_at
FROM poker_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- 4. פעולות פוקר (poker_actions)
SELECT 
  'Poker Action' as operation_type,
  id::text as operation_id,
  session_id::text,
  seat_index,
  action,
  amount,
  created_at
FROM poker_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 5. משחקי רולטה אחרונים
SELECT 
  'Roulette Session' as operation_type,
  id::text as operation_id,
  room_id::text,
  spin_number,
  stage,
  spin_result,
  spin_color,
  total_bets,
  total_payouts,
  created_at,
  updated_at
FROM roulette_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- 6. הימורי רולטה
SELECT 
  'Roulette Bet' as operation_type,
  rb.id::text as operation_id,
  rb.session_id::text,
  COALESCE(rp.player_name, 'Unknown') as player_name,
  rb.bet_type,
  rb.bet_value,
  rb.amount,
  NULL::bigint as prize_amount,
  rb.is_winner,
  rb.created_at
FROM roulette_bets rb
LEFT JOIN roulette_players rp ON rb.player_id = rp.id
WHERE rb.created_at >= NOW() - INTERVAL '7 days'
ORDER BY rb.created_at DESC
LIMIT 50;

-- 7. סיבובי רולטה (roulette_spins)
SELECT 
  'Roulette Spin' as operation_type,
  id::text as operation_id,
  session_id::text,
  spin_number,
  result,
  color,
  created_at
FROM roulette_spins
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 8. משחקי בינגו אחרונים
SELECT 
  'Bingo Session' as operation_type,
  id::text as operation_id,
  room_id,
  stage,
  pot_total,
  winner_name,
  started_at,
  finished_at,
  created_at,
  updated_at
FROM public.bingo_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- 9. תביעות פרסים בבינגו (bingo_claims)
SELECT 
  'Bingo Claim' as operation_type,
  id::text as operation_id,
  session_id::text,
  claimed_by_name as player_name,
  prize_key as claim_type,
  amount as prize_amount,
  round_id,
  created_at
FROM public.bingo_claims
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- 10. משחקי War אחרונים
SELECT 
  'War Session' as operation_type,
  id::text as operation_id,
  room_id::text,
  stage,
  round_no,
  created_at
FROM war_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- 11. משחקי דמקה אחרונים
SELECT 
  'Checkers Session' as operation_type,
  id::text as operation_id,
  room_id,
  stage,
  created_at,
  updated_at
FROM public.ck_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- ============================================================================
-- שאילתה מאוחדת - כל הפעולות האחרונות בסדר כרונולוגי
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

-- ============================================================================
-- סיכום פעולות לפי סוג
-- ============================================================================
SELECT 
  'Arcade Games' as category,
  COUNT(*) as total_operations,
  COUNT(DISTINCT device_id) as unique_devices,
  SUM(stake) as total_stakes,
  SUM(approved_reward) as total_rewards,
  SUM(approved_reward - stake) as net_result,
  MIN(created_at) as first_operation,
  MAX(created_at) as last_operation
FROM public.arcade_device_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Vault Updates' as category,
  COUNT(*) as total_operations,
  COUNT(DISTINCT device_id) as unique_devices,
  NULL::bigint as total_stakes,
  NULL::bigint as total_rewards,
  NULL::bigint as net_result,
  MIN(created_at) as first_operation,
  MAX(updated_at) as last_operation
FROM public.vault_balances
WHERE updated_at >= NOW() - INTERVAL '7 days'
   OR created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Poker Sessions' as category,
  COUNT(*) as total_operations,
  COUNT(DISTINCT room_id) as unique_devices,
  SUM(pot_total) as total_stakes,
  NULL::bigint as total_rewards,
  NULL::bigint as net_result,
  MIN(created_at) as first_operation,
  MAX(created_at) as last_operation
FROM poker_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Roulette Sessions' as category,
  COUNT(*) as total_operations,
  COUNT(DISTINCT room_id) as unique_devices,
  SUM(total_bets) as total_stakes,
  SUM(total_payouts) as total_rewards,
  SUM(total_payouts - total_bets) as net_result,
  MIN(created_at) as first_operation,
  MAX(created_at) as last_operation
FROM roulette_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  'Bingo Sessions' as category,
  COUNT(*) as total_operations,
  COUNT(DISTINCT room_id) as unique_devices,
  SUM(pot_total) as total_stakes,
  NULL::bigint as total_rewards,
  NULL::bigint as net_result,
  MIN(created_at) as first_operation,
  MAX(created_at) as last_operation
FROM public.bingo_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'

ORDER BY last_operation DESC;
