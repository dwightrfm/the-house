-- The House, migration 04: the calendar.
-- Paste this whole file into the Supabase SQL Editor and press Run. One time only.
-- Safe to run twice. Nothing is dropped, so the old history stays readable.

create extension if not exists "pgcrypto";

-- A plan is one thing to do. It either sits on a single date, or it repeats.
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  minutes int not null default 10,
  room_id uuid references rooms(id) on delete set null,
  on_date date,                              -- used when repeat = 'none'
  repeat text not null default 'none',       -- none | daily | weekly | biweekly | monthly
  repeat_dow int,                            -- 0 Sun .. 6 Sat, for weekly and biweekly
  repeat_dom int,                            -- 1..31, for monthly
  anchor date,                               -- first day the repeat is live
  until date,                                -- optional last day
  floor boolean not null default false,      -- survives a bare minimum week
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One row every time a repeating plan gets pushed to another day or skipped.
create table if not exists moves (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  from_date date not null,
  to_date date,                              -- null means skipped that one time
  unique (plan_id, from_date)
);

-- The log keeps every completion. Two new columns tie it to the calendar.
alter table log add column if not exists plan_id uuid;
alter table log add column if not exists on_date date;

alter table plans enable row level security;
alter table moves enable row level security;
drop policy if exists house_rw on plans;
drop policy if exists house_rw on moves;
create policy house_rw on plans for all to anon, authenticated using (true) with check (true);
create policy house_rw on moves for all to anon, authenticated using (true) with check (true);

-- Carry the old daily and weekly lists onto the calendar.
-- Daily items repeat every day. Weekly items land on Saturday.
insert into plans (title, minutes, room_id, repeat, repeat_dow, anchor, floor, sort_order)
select r.name, r.minutes, r.room_id,
       case when r.cadence = 'daily' then 'daily' else 'weekly' end,
       case when r.cadence = 'daily' then null else 6 end,
       current_date,
       r.cadence = 'daily',
       r.sort_order
from routines r
where not exists (select 1 from plans p where p.title = r.name);

-- The freshness columns on rooms are no longer read by the app.
-- They are left alone on purpose so nothing old breaks. Rooms are now just
-- labels that group tasks and their standard photos.
