SELECT
  public.base_offline_factor_for_seconds(30)    AS factor_30s,
  public.base_offline_factor_for_seconds(7200)  AS factor_2h,
  public.base_offline_factor_for_seconds(21600) AS factor_6h,
  public.base_offline_factor_for_seconds(43200) AS factor_12h,
  public.base_effective_offline_seconds(30)     AS effective_30s,
  public.base_effective_offline_seconds(7200)   AS effective_2h,
  public.base_effective_offline_seconds(21600)  AS effective_6h,
  public.base_effective_offline_seconds(43200)  AS effective_12h;
