import sql from './neonClient';

function unwrapRows(result) {
  if (Array.isArray(result)) return { rows: result, error: null };
  if (result && typeof result === 'object') {
    if (result.error) return { rows: [], error: result.error };
    if (Array.isArray(result.data)) return { rows: result.data, error: null };
    if (Array.isArray(result.rows)) return { rows: result.rows, error: null };
  }
  return { rows: [], error: null };
}

function mapWorkoutRow(row) {
  return {
    id: row.id,
    date: row.inserted_at ?? row.date ?? null,
    bodyPart: row.body_part ?? row.bodyPart,
    exercise: row.exercise,
    weight: row.weight,
    reps: row.reps,
    notes: row.notes ?? '',
  };
}

export async function fetchWorkouts() {
  const result = await sql`
    SELECT * FROM workouts
    ORDER BY inserted_at DESC
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows.map(mapWorkoutRow);
}

export async function saveWorkout(w) {
  const result = await sql`
    INSERT INTO workouts (body_part, exercise, weight, reps, notes)
    VALUES (${w.bodyPart}, ${w.exercise}, ${w.weight}, ${w.reps}, ${w.notes})
    RETURNING *
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows[0] ? mapWorkoutRow(rows[0]) : null;
}

export async function updateWorkout(id, w) {
  const result = await sql`
    UPDATE workouts
    SET body_part = ${w.bodyPart},
        exercise = ${w.exercise},
        weight = ${w.weight},
        reps = ${w.reps},
        notes = ${w.notes}
    WHERE id = ${id}
    RETURNING *
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows[0] ? mapWorkoutRow(rows[0]) : null;
}

export async function deleteWorkoutById(id) {
  const result = await sql`
    DELETE FROM workouts
    WHERE id = ${id}
    RETURNING *
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows.map(mapWorkoutRow);
}
  
export async function fetchCustomExercises() {
  const result = await sql`
    SELECT * FROM custom_exercises
    ORDER BY created_at ASC
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  const grouped = {};
  rows.forEach(r => {
    grouped[r.body_part] = grouped[r.body_part] || [];
    grouped[r.body_part].push(r.name);
  });
  return { data: rows, grouped };
}

export async function saveCustomExercise(bp, name) {
  const result = await sql`
    INSERT INTO custom_exercises (body_part, name)
    VALUES (${bp}, ${name})
    RETURNING *
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows[0];
}

export async function deleteCustomExerciseByName(bp, name) {
  const result = await sql`
    DELETE FROM custom_exercises
    WHERE body_part = ${bp} AND name = ${name}
    RETURNING *
  `;
  const { rows, error } = unwrapRows(result);
  if (error) throw error;
  return rows;
}
