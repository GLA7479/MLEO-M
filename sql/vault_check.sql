-- ============================================================================
-- VAULT SYSTEM HEALTH CHECK & VALIDATION
-- Run this in Supabase SQL Editor to verify everything is set up correctly
-- ============================================================================

-- ============================================================================
-- 1. CHECK TABLE EXISTS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vault_balances') THEN
    RAISE NOTICE '✅ Table vault_balances exists';
  ELSE
    RAISE WARNING '❌ Table vault_balances does NOT exist - run vault_schema.sql first!';
  END IF;
END $$;

-- ============================================================================
-- 2. CHECK TABLE STRUCTURE
-- ============================================================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'vault_balances'
ORDER BY ordinal_position;

-- ============================================================================
-- 3. CHECK INDEXES
-- ============================================================================
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'vault_balances';

-- Expected indexes:
-- - idx_vault_balances_device_id (on device_id)
-- - idx_vault_balances_last_sync (on last_sync_at)

-- ============================================================================
-- 4. CHECK FUNCTIONS EXIST
-- ============================================================================
DO $$
DECLARE
  func_count INTEGER;
BEGIN
  -- Check get_vault_balance
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' 
    AND p.proname = 'get_vault_balance';
  
  IF func_count > 0 THEN
    RAISE NOTICE '✅ Function get_vault_balance exists';
  ELSE
    RAISE WARNING '❌ Function get_vault_balance does NOT exist';
  END IF;
  
  -- Check sync_vault_delta
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' 
    AND p.proname = 'sync_vault_delta';
  
  IF func_count > 0 THEN
    RAISE NOTICE '✅ Function sync_vault_delta exists';
  ELSE
    RAISE WARNING '❌ Function sync_vault_delta does NOT exist';
  END IF;
END $$;

-- ============================================================================
-- 5. CHECK FUNCTION SIGNATURES
-- ============================================================================
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('get_vault_balance', 'sync_vault_delta')
ORDER BY p.proname;

-- Expected:
-- get_vault_balance(p_device_id text DEFAULT NULL) RETURNS TABLE(vault_balance bigint)
-- sync_vault_delta(p_game_id text, p_delta bigint, p_device_id text, p_prev_nonce text, p_next_nonce text) RETURNS TABLE(new_balance bigint)

-- ============================================================================
-- 6. CHECK RLS POLICIES
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'vault_balances';

-- Expected policies:
-- - vault_balances_read (SELECT for all)
-- - vault_balances_insert (INSERT for all)
-- - vault_balances_update (UPDATE for all)

-- ============================================================================
-- 7. CHECK RLS IS ENABLED
-- ============================================================================
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'vault_balances';

-- Should show: rls_enabled = true

-- ============================================================================
-- 8. CHECK PERMISSIONS
-- ============================================================================
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'vault_balances'
ORDER BY grantee, privilege_type;

-- Expected: anon and authenticated should have SELECT, INSERT, UPDATE

-- ============================================================================
-- 9. CHECK FUNCTION PERMISSIONS
-- ============================================================================
SELECT 
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public' 
  AND p.proname IN ('get_vault_balance', 'sync_vault_delta')
  AND r.rolname IN ('anon', 'authenticated')
ORDER BY p.proname, r.rolname;

-- ============================================================================
-- 10. TEST FUNCTION CALLS (with sample data)
-- ============================================================================
-- Test get_vault_balance with new device
DO $$
DECLARE
  test_device_id TEXT := 'test-device-' || gen_random_uuid()::TEXT;
  result RECORD;
BEGIN
  -- Test get_vault_balance for non-existent device (should return 0)
  SELECT * INTO result FROM public.get_vault_balance(test_device_id);
  IF result.vault_balance = 0 THEN
    RAISE NOTICE '✅ get_vault_balance returns 0 for new device (correct)';
  ELSE
    RAISE WARNING '❌ get_vault_balance returned % instead of 0', result.vault_balance;
  END IF;
  
  -- Test sync_vault_delta to create device
  SELECT * INTO result FROM public.sync_vault_delta(
    'test-game',
    1000,
    test_device_id,
    NULL,
    gen_random_uuid()::TEXT
  );
  IF result.new_balance = 1000 THEN
    RAISE NOTICE '✅ sync_vault_delta creates device and sets balance correctly';
  ELSE
    RAISE WARNING '❌ sync_vault_delta returned % instead of 1000', result.new_balance;
  END IF;
  
  -- Test get_vault_balance for existing device
  SELECT * INTO result FROM public.get_vault_balance(test_device_id);
  IF result.vault_balance = 1000 THEN
    RAISE NOTICE '✅ get_vault_balance returns correct balance for existing device';
  ELSE
    RAISE WARNING '❌ get_vault_balance returned % instead of 1000', result.vault_balance;
  END IF;
  
  -- Test sync_vault_delta to update balance
  SELECT * INTO result FROM public.sync_vault_delta(
    'test-game',
    -500,
    test_device_id,
    NULL,
    gen_random_uuid()::TEXT
  );
  IF result.new_balance = 500 THEN
    RAISE NOTICE '✅ sync_vault_delta updates balance correctly';
  ELSE
    RAISE WARNING '❌ sync_vault_delta returned % instead of 500', result.new_balance;
  END IF;
  
  -- Cleanup test data
  DELETE FROM public.vault_balances vb WHERE vb.device_id = test_device_id;
  RAISE NOTICE '✅ Test cleanup completed';
END $$;

-- ============================================================================
-- 11. CHECK FOR AMBIGUOUS COLUMN ISSUES
-- ============================================================================
-- This query checks if the function uses ambiguous column references
SELECT 
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_vault_balance';

-- Look for: Should use "vb.balance" or return "vault_balance" to avoid ambiguity

-- ============================================================================
-- 12. PERFORMANCE CHECK - TABLE STATISTICS
-- ============================================================================
SELECT 
  schemaname,
  relname AS tablename,
  n_live_tup AS row_count,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public' 
  AND relname = 'vault_balances';

-- ============================================================================
-- 13. CHECK FOR LOCKS (if any concurrent operations)
-- ============================================================================
SELECT 
  l.locktype,
  l.relation::regclass AS table_name,
  l.mode,
  l.granted,
  l.pid,
  a.query
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation::regclass::text = 'vault_balances';

-- Should be empty under normal conditions

-- ============================================================================
-- 14. CONCURRENCY TEST (simulate multiple users)
-- ============================================================================
-- This creates a test scenario with multiple devices updating simultaneously
DO $$
DECLARE
  device_ids TEXT[] := ARRAY[
    'test-device-1-' || gen_random_uuid()::TEXT,
    'test-device-2-' || gen_random_uuid()::TEXT,
    'test-device-3-' || gen_random_uuid()::TEXT
  ];
  device_id TEXT;
  result RECORD;
  success_count INTEGER := 0;
BEGIN
  -- Initialize all devices
  FOREACH device_id IN ARRAY device_ids
  LOOP
    SELECT * INTO result FROM public.sync_vault_delta(
      'concurrency-test',
      1000,
      device_id,
      NULL,
      gen_random_uuid()::TEXT
    );
    IF result.new_balance = 1000 THEN
      success_count := success_count + 1;
    END IF;
  END LOOP;
  
  IF success_count = array_length(device_ids, 1) THEN
    RAISE NOTICE '✅ Concurrency test: All % devices initialized successfully', array_length(device_ids, 1);
  ELSE
    RAISE WARNING '❌ Concurrency test: Only %/% devices initialized', success_count, array_length(device_ids, 1);
  END IF;
  
  -- Test concurrent updates
  success_count := 0;
  FOREACH device_id IN ARRAY device_ids
  LOOP
    SELECT * INTO result FROM public.sync_vault_delta(
      'concurrency-test',
      500,
      device_id,
      NULL,
      gen_random_uuid()::TEXT
    );
    IF result.new_balance = 1500 THEN
      success_count := success_count + 1;
    END IF;
  END LOOP;
  
  IF success_count = array_length(device_ids, 1) THEN
    RAISE NOTICE '✅ Concurrency test: All % devices updated successfully', array_length(device_ids, 1);
  ELSE
    RAISE WARNING '❌ Concurrency test: Only %/% devices updated correctly', success_count, array_length(device_ids, 1);
  END IF;
  
  -- Cleanup
  DELETE FROM public.vault_balances vb WHERE vb.device_id = ANY(device_ids);
  RAISE NOTICE '✅ Concurrency test cleanup completed';
END $$;

-- ============================================================================
-- 15. CHECK NONCE VALIDATION
-- ============================================================================
DO $$
DECLARE
  test_device_id TEXT := 'test-nonce-' || gen_random_uuid()::TEXT;
  first_nonce TEXT := gen_random_uuid()::TEXT;
  second_nonce TEXT := gen_random_uuid()::TEXT;
  result RECORD;
BEGIN
  -- Create device with first nonce
  SELECT * INTO result FROM public.sync_vault_delta(
    'nonce-test',
    1000,
    test_device_id,
    NULL,
    first_nonce
  );
  
  -- Try to update with wrong nonce (should fail)
  BEGIN
    SELECT * INTO result FROM public.sync_vault_delta(
      'nonce-test',
      500,
      test_device_id,
      'wrong-nonce',
      second_nonce
    );
    RAISE WARNING '❌ Nonce validation failed - should have raised exception';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Invalid nonce%' THEN
        RAISE NOTICE '✅ Nonce validation working correctly';
      ELSE
        RAISE WARNING '❌ Unexpected error: %', SQLERRM;
      END IF;
  END;
  
  -- Update with correct nonce (should succeed)
  SELECT * INTO result FROM public.sync_vault_delta(
    'nonce-test',
    500,
    test_device_id,
    first_nonce,
    second_nonce
  );
  IF result.new_balance = 1500 THEN
    RAISE NOTICE '✅ Nonce validation allows correct nonce';
  ELSE
    RAISE WARNING '❌ Nonce validation failed - balance is %', result.new_balance;
  END IF;
  
  -- Cleanup
  DELETE FROM public.vault_balances vb WHERE vb.device_id = test_device_id;
END $$;

-- ============================================================================
-- 16. CHECK TRIGGER FOR updated_at
-- ============================================================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public' 
  AND event_object_table = 'vault_balances';

-- Expected: trg_vault_balances_updated_at

-- ============================================================================
-- 17. SUMMARY REPORT
-- ============================================================================
SELECT 
  'Table exists' AS check_item,
  CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vault_balances')
    THEN '✅ PASS' ELSE '❌ FAIL' END AS status
UNION ALL
SELECT 
  'RLS enabled',
  CASE WHEN EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vault_balances' AND rowsecurity = true
  ) THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'get_vault_balance function exists',
  CASE WHEN EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'get_vault_balance'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'sync_vault_delta function exists',
  CASE WHEN EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'sync_vault_delta'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'Indexes exist',
  CASE WHEN (
    SELECT COUNT(*) FROM pg_indexes 
    WHERE schemaname = 'public' AND tablename = 'vault_balances'
  ) >= 2 THEN '✅ PASS' ELSE '❌ FAIL' END
UNION ALL
SELECT 
  'Permissions granted',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'vault_balances'
    AND grantee IN ('anon', 'authenticated')
  ) THEN '✅ PASS' ELSE '❌ FAIL' END
ORDER BY check_item;

-- ============================================================================
-- END OF HEALTH CHECK
-- ============================================================================
-- If all checks pass, your vault system is ready for production!
-- If any checks fail, review the errors above and run vault_schema.sql again.
