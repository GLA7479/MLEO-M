-- MINERS debug: איפוס רך למכשיר — מאפס balance/vault/gift counters; החלף PUT-DEVICE-ID-HERE
update public.miners_device_state
set
  balance = 0,
  mined_today = 0,
  score_today = 0,
  last_day = current_date,
  vault = 0,
  claimed_total = 0,
  claimed_to_wallet = 0,
  last_gift_claim_at = null,
  gift_next_claim_at = null,
  gift_claim_count = 0,
  updated_at = now()
where device_id = 'PUT-DEVICE-ID-HERE';
