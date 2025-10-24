-- שלב 1: לראות מה קיים כרגע
select tablename, indexname, indexdef
from pg_indexes
where schemaname='public' and tablename in ('bj_players','arcade_room_players')
order by tablename, indexname;

-- שלב 2: לבטל ייחוד ישן שמייצר את ה-409
drop index if exists uq_bj_players_session_name;            -- (session_id, player_name)
drop index if exists uq_arcade_room_players_room_name;      -- (room_id, player_name)

-- שלב 3: להבטיח אינדקסים הנכונים
create unique index if not exists uq_bj_players_session_client
  on bj_players (session_id, client_id);

create unique index if not exists uq_bj_players_session_seat
  on bj_players (session_id, seat);

create unique index if not exists uq_arcade_room_players_room_client
  on arcade_room_players (room_id, client_id);

-- שלב 4: ניקוי "רוחות" ישנות (בטוח)
delete from arcade_room_players arp
where not exists (select 1 from arcade_rooms r where r.id = arp.room_id);

delete from bj_players p
where p.status = 'left'
   or not exists (select 1 from bj_sessions s where s.id = p.session_id);
