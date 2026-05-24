import supabase from './supabaseClient';

export async function fetchWorkouts() {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .order('inserted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveWorkout(w) {
  const { data, error } = await supabase
    .from('workouts')
    .insert([{ body_part: w.bodyPart, exercise: w.exercise, weight: w.weight, reps: w.reps, notes: w.notes }])
    .select();
  if (error) throw error;
  return data[0];
}

export async function fetchCustomExercises() {
  const { data, error } = await supabase
    .from('custom_exercises')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const grouped = {};
  data.forEach(r => {
    grouped[r.body_part] = grouped[r.body_part] || [];
    grouped[r.body_part].push(r.name);
  });
  return { data, grouped };
}

export async function saveCustomExercise(bp, name) {
  const { data, error } = await supabase
    .from('custom_exercises')
    .insert([{ body_part: bp, name }])
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteCustomExerciseByName(bp, name) {
  const { data, error } = await supabase
    .from('custom_exercises')
    .delete()
    .match({ body_part: bp, name })
    .select();
  if (error) throw error;
  return data;
}
