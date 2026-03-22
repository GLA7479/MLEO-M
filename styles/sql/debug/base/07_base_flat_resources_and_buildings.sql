-- BASE debug: משאבים ובניינים שטוחים מ-jsonb — קריאה בלבד
select
  device_id,
  coalesce((resources->>'ORE')::numeric, 0) as ore,
  coalesce((resources->>'SCRAP')::numeric, 0) as scrap,
  coalesce((resources->>'ENERGY')::numeric, 0) as energy,
  coalesce((resources->>'GOLD')::numeric, 0) as gold,
  coalesce((resources->>'DATA')::numeric, 0) as data,
  coalesce((buildings->>'hq')::int, 0) as hq,
  coalesce((buildings->>'quarry')::int, 0) as quarry,
  coalesce((buildings->>'salvage')::int, 0) as salvage,
  coalesce((buildings->>'refinery')::int, 0) as refinery,
  coalesce((buildings->>'tradeHub')::int, 0) as trade_hub,
  coalesce((buildings->>'powerCell')::int, 0) as power_cell,
  coalesce((buildings->>'logisticsCenter')::int, 0) as logistics_center,
  updated_at
from public.base_device_state
order by updated_at desc;
