-- Supabase SQL schema for GymProgress

-- Table: workouts
create table if not exists workouts (
  id bigint generated always as identity primary key,
  inserted_at timestamptz default now(),
  body_part text,
  exercise text,
  weight numeric,
  reps integer,
  notes text
);

-- Table: custom_exercises
create table if not exists custom_exercises (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  body_part text,
  name text
);
create unique index if not exists ux_custom_exercises_bodypart_name on custom_exercises(body_part, name);
