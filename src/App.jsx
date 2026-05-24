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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-4 sm:px-6 sm:py-6 font-sans">
      <header className="max-w-3xl mx-auto mb-4 sm:mb-6">
        <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg flex items-center gap-3 sm:gap-4">
          <Dumbbell className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Gym Progress</h1>
            <p className="text-xs sm:text-sm opacity-90 leading-relaxed">Catat, pantau, dan lihat progres progressive overload dengan cepat.</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <section className="xl:col-span-2 space-y-4">
          <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-5 rounded-2xl shadow">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 className="flex items-center gap-2 font-semibold text-gray-800 text-sm sm:text-base"><Activity className="w-4 h-4" /> Tambah Set</h2>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Search className="w-4 h-4 text-gray-400" />
                <input placeholder="Cari..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-52 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={bodyPart} onChange={e => { setBodyPart(e.target.value); setExercise(''); }} className="w-full p-3 rounded-xl border bg-white text-sm">
                {BODY_PARTS.map(bp => <option key={bp} value={bp}>{bp}</option>)}
              </select>
              <div>
                <select value={exercise} onChange={e => setExercise(e.target.value)} className="w-full p-3 rounded-xl border bg-white text-sm">
                  <option value="">Pilih gerakan...</option>
                  {exercisesForBodyPart(bodyPart).map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                  <option value="__custom__">-- Gerakan kustom --</option>
                </select>
                {exercise === '__custom__' && (
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <input value={customExerciseName} onChange={e => setCustomExerciseName(e.target.value)} placeholder="Nama gerakan baru" className="w-full p-3 rounded-xl border text-sm flex-1" />
                    <button type="button" onClick={() => addCustomExercise(bodyPart, customExerciseName)} className="w-full sm:w-auto px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Simpan</button>
                  </div>
                )}
              </div>
              <input type="number" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Beban (kg)" className="w-full p-3 rounded-xl border text-sm" />
              <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Repetisi" className="w-full p-3 rounded-xl border text-sm" />
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" className="w-full p-3 rounded-xl border text-sm sm:col-span-2" />
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-3 rounded-xl shadow font-semibold text-sm">Simpan Set</button>
              <button type="button" onClick={() => { setBodyPart(''); setExercise(''); setWeight(''); setReps(''); setNotes(''); }} className="w-full sm:w-auto px-4 py-3 rounded-xl border text-sm">Reset</button>
            </div>
          </form>

          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h3 className="font-semibold text-sm sm:text-base">Riwayat Latihan</h3>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 w-full sm:w-auto">
                <select value={filterBodyPart} onChange={e => setFilterBodyPart(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-white">
                  <option value="">Semua Body Part</option>
                  {uniqueBodyParts.map(bp => <option key={bp} value={bp}>{bp}</option>)}
                </select>
                <select value={filterExercise} onChange={e => setFilterExercise(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-white">
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
                  <div key={hw.id} className="p-3 sm:p-4 bg-slate-50 rounded-xl border flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-white rounded-md border text-gray-700">{hw.bodyPart}</span>
                        <h4 className="font-semibold text-sm sm:text-base break-words">{hw.exercise}</h4>
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500 mt-1">{format(new Date(hw.date), 'dd MMM yyyy HH:mm')}</div>
                      {hw.notes && <div className="mt-2 text-sm text-gray-600 break-words">Note: {hw.notes}</div>}
                    </div>

                    <div className="text-left sm:text-right flex flex-col items-stretch sm:items-end gap-2">
                      <div className="font-bold text-sm sm:text-base">{hw.weight} kg × {hw.reps}</div>
                      <div>
                        {hw.overloadStatus === 'progress' && <span className="inline-flex text-green-700 bg-green-100 px-2 py-1 rounded-lg text-xs sm:text-sm items-center gap-1"><TrendingUp className="w-4 h-4"/> Overload</span>}
                        {hw.overloadStatus === 'regress' && <span className="inline-flex text-red-600 bg-red-100 px-2 py-1 rounded-lg text-xs sm:text-sm items-center gap-1"><TrendingDown className="w-4 h-4"/> Turun</span>}
                        {hw.overloadStatus === 'maintain' && <span className="inline-flex text-gray-600 bg-gray-100 px-2 py-1 rounded-lg text-xs sm:text-sm items-center gap-1"><Minus className="w-4 h-4"/> Sama</span>}
                        {hw.overloadStatus === 'first_time' && <span className="inline-flex text-blue-600 bg-blue-50 px-2 py-1 rounded-lg text-xs sm:text-sm">Record</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button onClick={() => startEdit(hw)} className="w-full px-3 py-2 rounded-lg border text-xs sm:text-sm flex items-center justify-center gap-1"><Edit2 className="w-4 h-4"/> Edit</button>
                        <button onClick={() => deleteWorkout(hw.id)} className="w-full px-3 py-2 rounded-lg border text-xs sm:text-sm text-red-600">Hapus</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editingId && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow">
              <h4 className="font-semibold mb-3 text-sm sm:text-base">Edit Entry</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editFields.bodyPart || ''} onChange={e => setEditFields({...editFields, bodyPart: e.target.value})} className="w-full p-3 border rounded-xl text-sm" />
                <input value={editFields.exercise || ''} onChange={e => setEditFields({...editFields, exercise: e.target.value})} className="w-full p-3 border rounded-xl text-sm" />
                <input value={editFields.weight || ''} onChange={e => setEditFields({...editFields, weight: e.target.value})} className="w-full p-3 border rounded-xl text-sm" />
                <input value={editFields.reps || ''} onChange={e => setEditFields({...editFields, reps: e.target.value})} className="w-full p-3 border rounded-xl text-sm" />
                <input value={editFields.notes || ''} onChange={e => setEditFields({...editFields, notes: e.target.value})} className="w-full p-3 border rounded-xl text-sm sm:col-span-2" />
              </div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button onClick={() => saveEdit(editingId)} className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold text-sm">Simpan</button>
                <button onClick={cancelEdit} className="w-full sm:w-auto px-4 py-3 rounded-xl border text-sm">Batal</button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 self-start">
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow">
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Statistik Singkat</h3>
            {Object.keys(stats).length === 0 ? (
              <div className="text-sm text-gray-500">Belum ada data.</div>
            ) : (
              <div className="space-y-2 text-sm max-h-56 overflow-auto pr-1">
                {Object.entries(stats).map(([ex, s]) => (
                  <div key={ex} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
                    <div className="font-medium text-sm break-words">{ex}</div>
                    <div className="text-xs text-gray-600 sm:text-right">Best: {s.best} kg · Volume: {Math.round(s.volume)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow">
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Quick Tips</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>- Catat setiap set utama (work set) untuk akurasi progres.</li>
              <li>- Gunakan notes untuk mencatat tempo atau RPE.</li>
              <li>- Filter di atas untuk melihat progress per latihan atau body part.</li>
            </ul>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow">
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Settings — Gerakan Kustom</h3>
            {Object.keys(savedExercises).length === 0 ? (
              <div className="text-sm text-gray-500">Belum ada gerakan kustom.</div>
            ) : (
              <div className="space-y-2 text-sm max-h-72 overflow-auto pr-1">
                {BODY_PARTS.map(bp => (
                  savedExercises[bp] && savedExercises[bp].length > 0 ? (
                    <div key={bp} className="mb-2">
                      <div className="font-medium text-sm">{bp}</div>
                      <ul className="mt-1 space-y-1">
                        {savedExercises[bp].map(name => (
                          <li key={name} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-slate-50 p-2 rounded-lg">
                            <span className="break-words">{name}</span>
                            <button onClick={() => removeCustomExercise(bp, name)} className="text-sm text-red-600 px-2 py-1 rounded border self-start sm:self-auto">Hapus</button>
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