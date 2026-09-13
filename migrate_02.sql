-- The House, migration 02: remember a room's freshness before each tap,
-- so Undo can put it back exactly instead of guessing.
alter table log add column if not exists fresh_before numeric;
