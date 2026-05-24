import React, { useState, useEffect, useMemo } from 'react';
import { fetchWorkouts, saveWorkout, fetchCustomExercises, saveCustomExercise, deleteCustomExerciseByName } from './db';
import { format } from 'date-fns';
import { Activity, Dumbbell, History, TrendingUp, TrendingDown, Minus, Edit2, Search } from 'lucide-react';

export default function App() {
  const [workouts, setWorkouts] = useState([]);
  const [bodyPart, setBodyPart] = useState('Chest');
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');

  // Predefined body parts and default exercises
  const BODY_PARTS = ['Chest','Back','Tricep','Bicep','Shoulder','Leg','Abs'];
  const DEFAULT_EXERCISES = {
    Chest: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Bench Press'],
    Back: ['Barbell Row', 'Pull Up', 'Lat Pulldown'],
    Tricep: ['Tricep Pushdown', 'Dips'],
    Bicep: ['Barbell Curl', 'Dumbbell Curl'],
    Shoulder: ['Overhead Press', 'Lateral Raise'],
    Leg: ['Squat', 'Romanian Deadlift', 'Leg Press'],
    Abs: ['Hanging Leg Raise', 'Crunch']
  };

  // Saved custom exercises per body part (persisted)
  const [savedExercises, setSavedExercises] = useState({});
  const [customExerciseName, setCustomExerciseName] = useState('');

  const [filterBodyPart, setFilterBodyPart] = useState('');
  const [filterExercise, setFilterExercise] = useState('');
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});

  useEffect(() => {
    // Load from Supabase (falls back to existing localStorage on error)
    let mounted = true;
    (async () => {
      try {
        const ws = await fetchWorkouts();
        const ex = await fetchCustomExercises();
        if (!mounted) return;
        setWorkouts(ws || []);
        setSavedExercises(ex.grouped || {});
      } catch (err) {
        console.error('Supabase load failed, falling back to localStorage', err);
        const saved = localStorage.getItem('gymProgressWorkouts');
        if (saved) setWorkouts(JSON.parse(saved));
        const s = localStorage.getItem('gymSavedExercises');
        if (s) setSavedExercises(JSON.parse(s));
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    // keep local fallback copy
    localStorage.setItem('gymProgressWorkouts', JSON.stringify(workouts));
  }, [workouts]);

  useEffect(() => {
    localStorage.setItem('gymSavedExercises', JSON.stringify(savedExercises));
  }, [savedExercises]);

  const previousFor = (exerciseName) => {
    return workouts.find(w => w.exercise.toLowerCase() === exerciseName.toLowerCase());
  };

  const computeStatus = (exerciseName, w, r) => {
    const prev = previousFor(exerciseName);
    if (!prev) return 'first_time';
    const pWeight = parseFloat(prev.weight);
    const pReps = parseInt(prev.reps);
    const cWeight = parseFloat(w);
    const cReps = parseInt(r);
    if (cWeight > pWeight) return 'progress';
    if (cWeight === pWeight && cReps > pReps) return 'progress';
    if (cWeight === pWeight && cReps === pReps) return 'maintain';
    return 'regress';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bodyPart || !exercise || !weight || !reps) return;
    const overloadStatus = computeStatus(exercise, weight, reps);
    const newWorkout = {
      bodyPart,
      exercise,
      weight: parseFloat(weight),
      reps: parseInt(reps),
      notes: notes || '',
      overloadStatus
    };
    try {
      const saved = await saveWorkout(newWorkout);
      // saved contains fields from DB (id, inserted_at)
      const mapped = {
        id: saved.id || Date.now().toString(),
        date: saved.inserted_at || new Date().toISOString(),
        bodyPart: saved.body_part || saved.bodyPart,
        exercise: saved.exercise,
        weight: saved.weight,
        reps: saved.reps,
        notes: saved.notes || newWorkout.notes,
        overloadStatus: newWorkout.overloadStatus
      };
      setWorkouts(prev => [mapped, ...prev]);
    } catch (err) {
      console.error('Save workout failed, storing locally', err);
      const mapped = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        ...newWorkout
      };
      setWorkouts(prev => [mapped, ...prev]);
    }
    setWeight('');
    setReps('');
    setNotes('');
  };

  const deleteWorkout = (id) => setWorkouts(workouts.filter(w => w.id !== id));

  const uniqueBodyParts = useMemo(() => [...new Set(workouts.map(w => w.bodyPart))], [workouts]);
  const uniqueExercises = useMemo(() => [...new Set(workouts.map(w => w.exercise))], [workouts]);

  const filtered = workouts.filter(w => {
    if (filterBodyPart && w.bodyPart !== filterBodyPart) return false;
    if (filterExercise && w.exercise !== filterExercise) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(`${w.exercise} ${w.bodyPart} ${w.notes}`.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  // Helpers to get exercises for selected body part
  const exercisesForBodyPart = (bp) => {
    const defaults = DEFAULT_EXERCISES[bp] || [];
    const saved = (savedExercises[bp] || []);
    return [...defaults, ...saved];
  };

  const addCustomExercise = async (bp, name) => {
    if (!name) return;
    try {
      const saved = await saveCustomExercise(bp, name);
      setSavedExercises(prev => {
        const copy = {...prev};
        copy[bp] = Array.from(new Set([...(copy[bp] || []), saved.name]));
        return copy;
      });
      setExercise(saved.name);
    } catch (err) {
      console.error('Save custom exercise failed, storing locally', err);
      setSavedExercises(prev => {
        const copy = {...prev};
        copy[bp] = Array.from(new Set([...(copy[bp] || []), name]));
        return copy;
      });
      setExercise(name);
    }
    setCustomExerciseName('');
  };

  const removeCustomExercise = async (bp, name) => {
    if (!confirm(`Hapus gerakan "${name}" dari ${bp}?`)) return;
    try {
      await deleteCustomExerciseByName(bp, name);
      setSavedExercises(prev => {
        const copy = {...prev};
        if (!copy[bp]) return prev;
        copy[bp] = copy[bp].filter(x => x !== name);
        if (copy[bp].length === 0) delete copy[bp];
        return copy;
      });
      if (exercise === name) setExercise('');
    } catch (err) {
      console.error('Delete custom exercise failed', err);
      // fallback: remove locally
      setSavedExercises(prev => {
        const copy = {...prev};
        if (!copy[bp]) return prev;
        copy[bp] = copy[bp].filter(x => x !== name);
        if (copy[bp].length === 0) delete copy[bp];
        return copy;
      });
      if (exercise === name) setExercise('');
    }
  };

  // Stats per exercise
  const stats = useMemo(() => {
    const map = {};
    workouts.forEach(w => {
      if (!map[w.exercise]) map[w.exercise] = { best: 0, volume: 0 };
      if (w.weight > map[w.exercise].best) map[w.exercise].best = w.weight;
      map[w.exercise].volume += (w.weight * w.reps);
    });
    return map;
  }, [workouts]);

  const startEdit = (hw) => {
    setEditingId(hw.id);
    setEditFields({ bodyPart: hw.bodyPart, exercise: hw.exercise, weight: hw.weight, reps: hw.reps, notes: hw.notes });
  };

  const saveEdit = (id) => {
    setWorkouts(workouts.map(w => w.id === id ? {
      ...w,
      bodyPart: editFields.bodyPart,
      exercise: editFields.exercise,
      weight: parseFloat(editFields.weight),
      reps: parseInt(editFields.reps),
      notes: editFields.notes,
      overloadStatus: computeStatus(editFields.exercise, editFields.weight, editFields.reps)
    } : w));
    setEditingId(null);
    setEditFields({});
  };

  const cancelEdit = () => { setEditingId(null); setEditFields({}); };

  return (
    <div className="max-w-4xl mx-auto min-h-screen bg-gradient-to-b from-slate-50 to-white p-6 font-sans">
      <header className="max-w-3xl mx-auto mb-6">
        <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg flex items-center gap-4">
          <Dumbbell className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Gym Progress</h1>
            <p className="text-sm opacity-90">Catat, pantau, dan lihat progres progressive overload dengan cepat.</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="md:col-span-2 space-y-4">
          <form onSubmit={handleSubmit} className="bg-white p-4 rounded-2xl shadow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 font-semibold text-gray-800"><Activity /> Tambah Set</h2>
              <div className="flex gap-2 items-center">
                <Search className="w-4 h-4 text-gray-400" />
                <input placeholder="Cari..." value={search} onChange={e => setSearch(e.target.value)} className="px-2 py-1 rounded-md border border-gray-100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <select value={bodyPart} onChange={e => { setBodyPart(e.target.value); setExercise(''); }} className="p-3 rounded-xl border">
                {BODY_PARTS.map(bp => <option key={bp} value={bp}>{bp}</option>)}
              </select>
              <div>
                <select value={exercise} onChange={e => setExercise(e.target.value)} className="w-full p-3 rounded-xl border">
                  <option value="">Pilih gerakan...</option>
                  {exercisesForBodyPart(bodyPart).map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                  <option value="__custom__">-- Gerakan kustom --</option>
                </select>
                {exercise === '__custom__' && (
                  <div className="mt-2 flex gap-2">
                    <input value={customExerciseName} onChange={e => setCustomExerciseName(e.target.value)} placeholder="Nama gerakan baru" className="p-2 rounded border flex-1" />
                    <button type="button" onClick={() => addCustomExercise(bodyPart, customExerciseName)} className="px-3 py-1 rounded bg-indigo-600 text-white">Simpan</button>
                  </div>
                )}
              </div>
              <input type="number" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Beban (kg)" className="p-3 rounded-xl border" />
              <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Repetisi" className="p-3 rounded-xl border" />
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" className="p-3 rounded-xl border col-span-2" />
            </div>

            <div className="mt-3 flex gap-2">
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl shadow">Simpan Set</button>
              <button type="button" onClick={() => { setBodyPart(''); setExercise(''); setWeight(''); setReps(''); setNotes(''); }} className="px-4 py-2 rounded-xl border">Reset</button>
            </div>
          </form>

          <div className="bg-white p-4 rounded-2xl shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Riwayat Latihan</h3>
              <div className="flex gap-2">
                <select value={filterBodyPart} onChange={e => setFilterBodyPart(e.target.value)} className="px-2 py-1 rounded-md border">
                  <option value="">Semua Body Part</option>
                  {uniqueBodyParts.map(bp => <option key={bp} value={bp}>{bp}</option>)}
                </select>
                <select value={filterExercise} onChange={e => setFilterExercise(e.target.value)} className="px-2 py-1 rounded-md border">
                  <option value="">Semua Latihan</option>
                  {uniqueExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-8">Tidak ada data.</div>
            ) : (
              <div className="space-y-3">
                {filtered.map(hw => (
                  <div key={hw.id} className="p-3 bg-slate-50 rounded-xl border flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-white rounded-md border text-gray-700">{hw.bodyPart}</span>
                        <h4 className="font-semibold">{hw.exercise}</h4>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{format(new Date(hw.date), 'dd MMM yyyy HH:mm')}</div>
                      {hw.notes && <div className="mt-2 text-sm text-gray-600">Note: {hw.notes}</div>}
                    </div>

                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="font-bold">{hw.weight} kg × {hw.reps}</div>
                      <div>
                        {hw.overloadStatus === 'progress' && <span className="text-green-700 bg-green-100 px-2 py-1 rounded-lg text-sm flex items-center gap-1"><TrendingUp className="w-4 h-4"/> Overload</span>}
                        {hw.overloadStatus === 'regress' && <span className="text-red-600 bg-red-100 px-2 py-1 rounded-lg text-sm flex items-center gap-1"><TrendingDown className="w-4 h-4"/> Turun</span>}
                        {hw.overloadStatus === 'maintain' && <span className="text-gray-600 bg-gray-100 px-2 py-1 rounded-lg text-sm flex items-center gap-1"><Minus className="w-4 h-4"/> Sama</span>}
                        {hw.overloadStatus === 'first_time' && <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-lg text-sm">Record</span>}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => startEdit(hw)} className="px-3 py-1 rounded-lg border text-sm flex items-center gap-1"><Edit2 className="w-4 h-4"/> Edit</button>
                        <button onClick={() => deleteWorkout(hw.id)} className="px-3 py-1 rounded-lg border text-sm text-red-600">Hapus</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editingId && (
            <div className="bg-white p-4 rounded-2xl shadow">
              <h4 className="font-semibold mb-2">Edit Entry</h4>
              <div className="grid grid-cols-2 gap-3">
                <input value={editFields.bodyPart || ''} onChange={e => setEditFields({...editFields, bodyPart: e.target.value})} className="p-2 border rounded" />
                <input value={editFields.exercise || ''} onChange={e => setEditFields({...editFields, exercise: e.target.value})} className="p-2 border rounded" />
                <input value={editFields.weight || ''} onChange={e => setEditFields({...editFields, weight: e.target.value})} className="p-2 border rounded" />
                <input value={editFields.reps || ''} onChange={e => setEditFields({...editFields, reps: e.target.value})} className="p-2 border rounded" />
                <input value={editFields.notes || ''} onChange={e => setEditFields({...editFields, notes: e.target.value})} className="p-2 border rounded col-span-2" />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => saveEdit(editingId)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Simpan</button>
                <button onClick={cancelEdit} className="px-4 py-2 rounded-xl border">Batal</button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow">
            <h3 className="font-semibold mb-2">Statistik Singkat</h3>
            {Object.keys(stats).length === 0 ? (
              <div className="text-sm text-gray-500">Belum ada data.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {Object.entries(stats).map(([ex, s]) => (
                  <div key={ex} className="flex justify-between items-center">
                    <div className="font-medium">{ex}</div>
                    <div className="text-right text-xs text-gray-600">Best: {s.best} kg · Volume: {Math.round(s.volume)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl shadow">
            <h3 className="font-semibold mb-2">Quick Tips</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>- Catat setiap set utama (work set) untuk akurasi progres.</li>
              <li>- Gunakan notes untuk mencatat tempo atau RPE.</li>
              <li>- Filter di atas untuk melihat progress per latihan atau body part.</li>
            </ul>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow">
            <h3 className="font-semibold mb-2">Settings — Gerakan Kustom</h3>
            {Object.keys(savedExercises).length === 0 ? (
              <div className="text-sm text-gray-500">Belum ada gerakan kustom.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {BODY_PARTS.map(bp => (
                  savedExercises[bp] && savedExercises[bp].length > 0 ? (
                    <div key={bp} className="mb-2">
                      <div className="font-medium">{bp}</div>
                      <ul className="mt-1 space-y-1">
                        {savedExercises[bp].map(name => (
                          <li key={name} className="flex items-center justify-between bg-slate-50 p-2 rounded">
                            <span>{name}</span>
                            <button onClick={() => removeCustomExercise(bp, name)} className="text-sm text-red-600 px-2 py-1 rounded border">Hapus</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}