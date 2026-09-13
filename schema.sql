-- THE HOUSE — database schema
-- Paste this whole file into the Supabase SQL Editor and press Run. One time only.

create extension if not exists "pgcrypto";

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'H',
  decay_per_day numeric not null default 5,
  sort_order int not null default 0,
  in_floor boolean not null default false,
  fresh_base numeric not null default 100,
  fresh_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  minutes int not null default 5,
  standard_note text,
  standard_photo text,
  sort_order int not null default 0
);

create table if not exists log (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  room_id uuid references rooms(id) on delete set null,
  task_name text,
  minutes int not null default 0,
  points int not null default 0,
  fresh_before numeric,
  created_at timestamptz not null default now()
);

create table if not exists thanks (
  id uuid primary key default gen_random_uuid(),
  from_person text not null,
  to_person text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists date_nights (
  id uuid primary key default gen_random_uuid(),
  week_of date not null unique,
  picker text,
  plan text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  weekly_goal int not null default 180,
  floor_goal int not null default 45,
  bare_minimum boolean not null default false,
  bare_minimum_week date,
  season_started date not null default current_date,
  setup_done boolean not null default false
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- No login. Anyone holding the anon key can read and write.
-- That key ships in the public repo, so treat this data as public.
alter table rooms        enable row level security;
alter table tasks        enable row level security;
alter table log          enable row level security;
alter table thanks       enable row level security;
alter table date_nights  enable row level security;
alter table settings     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rooms','tasks','log','thanks','date_nights','settings'] loop
    execute format('drop policy if exists house_rw on %I', t);
    execute format(
      'create policy house_rw on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Starting rooms. Edit the names here or in the app later.
insert into rooms (name, icon, decay_per_day, sort_order, in_floor) values
  ('Kitchen',     'KT', 15, 1, true),
  ('Bathrooms',   'BA',  8, 2, true),
  ('Living Room', 'LR',  5, 3, true),
  ('Floors',      'FL',  8, 4, false),
  ('Bedroom',     'BD',  5, 5, false),
  ('Laundry',     'LA',  5, 6, false),
  ('Entryway',    'EN',  5, 7, false)
on conflict do nothing;

-- Starting tasks.
insert into tasks (room_id, name, minutes, sort_order)
select r.id, t.name, t.minutes, t.ord from rooms r join (values
  ('Kitchen','Clear and wipe counters',5,1),
  ('Kitchen','Dishes done, sink empty',10,2),
  ('Kitchen','Wipe the stove',5,3),
  ('Kitchen','Take out the trash',3,4),
  ('Bathrooms','Wipe sink and mirror',5,1),
  ('Bathrooms','Toilet',5,2),
  ('Bathrooms','Shower',10,3),
  ('Bathrooms','Fresh towels',3,4),
  ('Living Room','Clear surfaces',5,1),
  ('Living Room','Couch reset, pillows and blankets',3,2),
  ('Living Room','Put away what does not live here',5,3),
  ('Floors','Vacuum main areas',15,1),
  ('Floors','Mop kitchen and baths',15,2),
  ('Bedroom','Make the bed',3,1),
  ('Bedroom','Clear the nightstands',3,2),
  ('Bedroom','Clothes off the floor and chair',5,3),
  ('Bedroom','Change the sheets',10,4),
  ('Laundry','Start a load',3,1),
  ('Laundry','Move to dryer',3,2),
  ('Laundry','Fold and put away',15,3),
  ('Entryway','Shoes and bags put away',3,1),
  ('Entryway','Clear the drop zone',5,2)
) as t(room, name, minutes, ord) on r.name = t.room
where not exists (select 1 from tasks x where x.room_id = r.id and x.name = t.name);

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
