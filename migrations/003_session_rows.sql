-- Convert workouts to one row per exercise session with embedded sets

alter table workouts
  add column if not exists sets jsonb not null default '[]'::jsonb;

alter table workouts
  add column if not exists set_count integer not null default 1;

alter table workouts
  add column if not exists volume numeric not null default 0;

alter table workouts
  add column if not exists overload_status text not null default 'first_time';

with session_groups as (
  select
    session_id,
    min(id) as keep_id,
    max(inserted_at) as inserted_at,
    min(body_part) as body_part,
    min(exercise) as exercise,
    coalesce((array_agg(notes order by set_index))[1], '') as notes,
    jsonb_agg(
      jsonb_build_object(
        'weight', weight,
        'reps', reps,
        'notes', coalesce(notes, ''),
        'setIndex', set_index
      )
      order by set_index
    ) as sets,
    count(*) as set_count,
    sum(weight * reps) as volume,
    max(weight) as representative_weight,
    max(reps) as representative_reps
  from workouts
  group by session_id
)
update workouts w
set
  inserted_at = sg.inserted_at,
  body_part = sg.body_part,
  exercise = sg.exercise,
  notes = sg.notes,
  sets = sg.sets,
  set_count = sg.set_count,
  volume = sg.volume,
  overload_status = 'first_time',
  weight = sg.representative_weight,
  reps = sg.representative_reps
from session_groups sg
where w.id = sg.keep_id;

delete from workouts
where id not in (
  select min(id)
  from workouts
  group by session_id
);

create unique index if not exists ux_workouts_session_id
  on workouts(session_id);
