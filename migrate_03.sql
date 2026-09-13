-- The House, migration 03: the daily and weekly lists.
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  minutes int not null default 5,
  cadence text not null default 'daily',
  room_id uuid references rooms(id) on delete set null,
  sort_order int not null default 0
);
alter table log add column if not exists routine_id uuid;

alter table routines enable row level security;
drop policy if exists house_rw on routines;
create policy house_rw on routines for all to anon, authenticated using (true) with check (true);

insert into routines (name, minutes, cadence, sort_order, room_id)
select v.name, v.minutes, v.cadence, v.ord, r.id
from (values
  ('Dishes in the dishwasher', 5, 'daily', 1, 'Kitchen'),
  ('Counters wiped down',      5, 'daily', 2, 'Kitchen'),
  ('Sink empty',               3, 'daily', 3, 'Kitchen'),
  ('Table and couch cleared',  5, 'daily', 4, 'Living Room'),
  ('Beds made',                3, 'daily', 5, 'Bedroom'),
  ('Trash out if it is full',  3, 'daily', 6, 'Kitchen'),
  ('Bathrooms',               20, 'weekly', 1, 'Bathrooms'),
  ('Vacuum the main areas',   15, 'weekly', 2, 'Floors'),
  ('Mop kitchen and baths',   15, 'weekly', 3, 'Floors'),
  ('Sheets changed',          10, 'weekly', 4, 'Bedroom'),
  ('Trash and recycling out',  5, 'weekly', 5, 'Kitchen'),
  ('Fridge clear-out',        10, 'weekly', 6, 'Kitchen')
) as v(name, minutes, cadence, ord, room)
left join rooms r on r.name = v.room
where not exists (select 1 from routines x where x.name = v.name);
