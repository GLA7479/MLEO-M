BEGIN;

REVOKE SELECT, INSERT, UPDATE ON public.vault_balances FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_vault_balance(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vault_delta(text, bigint, text, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_freeplay_session(text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_paid_session(text, text, bigint) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) FROM public, anon, authenticated;

DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.freeplay_device_refresh(text) FROM public, anon, authenticated;
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION public.freeplay_device_consume(text, text) FROM public, anon, authenticated;
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.vault_balances TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vault_balance(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_vault_delta(text, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_freeplay_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_paid_session(text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) TO service_role;

DO $$
BEGIN
  BEGIN
    GRANT EXECUTE ON FUNCTION public.freeplay_device_refresh(text) TO service_role;
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;

  BEGIN
    GRANT EXECUTE ON FUNCTION public.freeplay_device_consume(text, text) TO service_role;
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;
END $$;

COMMIT;
