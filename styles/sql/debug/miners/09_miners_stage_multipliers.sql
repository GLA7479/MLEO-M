-- MINERS debug: מכפילי שלבים miners_stage_multipliers (קריאה בלבד)
select
  start_stage,
  end_stage,
  r
from public.miners_stage_multipliers
order by start_stage asc, end_stage asc;
