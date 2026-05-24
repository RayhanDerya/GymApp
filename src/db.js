import sql from './supabaseClient';

export async function fetchWorkouts() {
  const { data, error } = await sql`
    SELECT * FROM workouts
    ORDER BY inserted_at DESC
  `;
  if (error) throw error;
  return data;
}

export async function saveWorkout(w) {
  const { data, error } = await sql`
    INSERT INTO workouts (body_part, exercise, weight, reps, notes)
    VALUES (${w.bodyPart}, ${w.exercise}, ${w.weight}, ${w.reps}, ${w.notes})
    RETURNING *
  `;
  if (error) throw error;
  return data;
}
  
export async function fetchCustomExercises() {
  const { data, error } = await sql`
    SELECT * FROM custom_exercises
    ORDER BY created_at ASC
  `;
  if (error) throw error;
  const grouped = {};
  data.forEach(r => {
    grouped[r.body_part] = grouped[r.body_part] || [];
    grouped[r.body_part].push(r.name);
  });
  return { data, grouped };
}

export async function saveCustomExercise(bp, name) {
  const { data, error } = await sql`
    INSERT INTO custom_exercises (body_part, name)
    VALUES (${bp}, ${name})
    RETURNING *
  `;
  if (error) throw error;
  return data[0];
}

export async function deleteCustomExerciseByName(bp, name) {
  const { data, error } = await sql`
    DELETE FROM custom_exercises
    WHERE body_part = ${bp} AND name = ${name}
    RETURNING *
  `;
  if (error) throw error;
  return data;
}
