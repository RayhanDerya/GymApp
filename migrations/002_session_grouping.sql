-- Add session grouping for workout records

alter table workouts
  add column if not exists session_id text;

alter table workouts
  add column if not exists set_index integer not null default 1;

update workouts
set session_id = concat('legacy-', id)
where session_id is null;

alter table workouts
  alter column session_id set not null;

alter table workouts
  alter column set_index set default 1;
