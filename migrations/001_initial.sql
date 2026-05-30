-- Initial schema for GymProgress
-- Run with: npm run migrate

create table if not exists workouts (
  id bigint generated always as identity primary key,
  inserted_at timestamptz not null default now(),
  session_id text not null,
  set_index integer not null default 1,
  body_part text not null,
  exercise text not null,
  weight numeric not null,
  reps integer not null,
  notes text
);

create table if not exists custom_exercises (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  body_part text not null,
  name text not null
);

create unique index if not exists ux_custom_exercises_bodypart_name
  on custom_exercises(body_part, name);
