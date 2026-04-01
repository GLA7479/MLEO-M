-- Top 100 global shared vault leaderboard (authoritative: public.vault_balances.balance)
-- Service role only. No full device_id in the result set.

CREATE INDEX IF NOT EXISTS idx_vault_balances_balance_desc
  ON public.vault_balances (balance DESC);

CREATE OR REPLACE FUNCTION public.get_vault_leaderboard_top100()
RETURNS TABLE (
  leaderboard_rank bigint,
  vault_balance bigint,
  public_id_suffix text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_number() OVER (ORDER BY vb.balance DESC, vb.device_id ASC) AS leaderboard_rank,
    vb.balance AS vault_balance,
    CASE
      WHEN vb.device_id IS NULL OR btrim(vb.device_id) = '' THEN '------'
      WHEN length(btrim(vb.device_id)) <= 6 THEN upper(btrim(vb.device_id))
      ELSE upper(right(btrim(vb.device_id), 6))
    END AS public_id_suffix
  FROM public.vault_balances vb
  WHERE vb.balance > 0
  ORDER BY vb.balance DESC, vb.device_id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_vault_leaderboard_top100() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vault_leaderboard_top100() TO service_role;
