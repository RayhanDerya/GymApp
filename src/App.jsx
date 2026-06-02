import React, { useState, useEffect, useMemo } from 'react';
import { fetchWorkouts, saveWorkout, updateWorkout, deleteWorkoutById, fetchCustomExercises, saveCustomExercise, deleteCustomExerciseByName } from './db';
import { format } from 'date-fns';
import { Activity, Dumbbell, TrendingUp, TrendingDown, Minus, Edit2, Search, BarChart3, CalendarDays, Flame, Layers3, ShieldCheck, Sparkles, TimerReset, Target, Award } from 'lucide-react';

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
  const [entryMode, setEntryMode] = useState('single');
  const [bulkSetCount, setBulkSetCount] = useState(3);
  const [manualSets, setManualSets] = useState([{ weight: '', reps: '', notes: '' }]);

  const getWorkoutDate = (workout) => workout.date || workout.inserted_at || new Date(0).toISOString();

  const computeOverloadStatus = (previous, current) => {
    if (!previous) return 'first_time';

    const previousWeight = parseFloat(previous.weight);
    const previousReps = parseInt(previous.reps);
    const currentWeight = parseFloat(current.weight);
    const currentReps = parseInt(current.reps);

    if (currentWeight > previousWeight) return 'progress';
    if (currentWeight === previousWeight && currentReps > previousReps) return 'progress';
    if (currentWeight === previousWeight && currentReps === previousReps) return 'maintain';
    return 'regress';
  };

  const normalizeSetRows = (setRows, fallbackNotes = '') => {
    return setRows
      .filter(setRow => setRow.weight !== '' && setRow.reps !== '')
      .map((setRow, index) => ({
        setIndex: index + 1,
        weight: parseFloat(setRow.weight),
        reps: parseInt(setRow.reps, 10),
        notes: setRow.notes || fallbackNotes || ''
      }));
  };

  const summarizeSessionSets = (sets) => {
    const volume = sets.reduce((total, setRow) => total + (parseFloat(setRow.weight) * parseInt(setRow.reps, 10)), 0);
    const summary = sets.reduce((best, row) => {
      if (!best) return row;
      const bestWeight = parseFloat(best.weight);
      const rowWeight = parseFloat(row.weight);
      const bestReps = parseInt(best.reps, 10);
      const rowReps = parseInt(row.reps, 10);
      if (rowWeight > bestWeight) return row;
      if (rowWeight === bestWeight && rowReps > bestReps) return row;
      return best;
    }, null);

    return {
      volume,
      summary: summary || sets[0] || null
    };
  };

  const decorateWorkouts = (items = []) => {
    const chronological = [...items].sort((left, right) => new Date(getWorkoutDate(left)) - new Date(getWorkoutDate(right)));
    const groupedBySession = new Map();

    chronological.forEach((workout) => {
      const sessionKey = workout.sessionId || `legacy-${workout.id}`;
      if (!groupedBySession.has(sessionKey)) {
        groupedBySession.set(sessionKey, []);
      }
      groupedBySession.get(sessionKey).push(workout);
    });

    const sessions = Array.from(groupedBySession.entries()).map(([sessionKey, rows]) => {
      const orderedRows = [...rows].sort((left, right) => (left.setIndex || 1) - (right.setIndex || 1));
      const source = orderedRows[0];
      const embeddedSets = Array.isArray(source.sets) && source.sets.length > 0
        ? source.sets.map((setRow, index) => ({
            setIndex: setRow.setIndex || index + 1,
            weight: setRow.weight,
            reps: setRow.reps,
            notes: setRow.notes || ''
          }))
        : orderedRows.map((row, index) => ({
            id: row.id,
            setIndex: row.setIndex || index + 1,
            weight: row.weight,
            reps: row.reps,
            notes: row.notes || ''
          }));

      const { volume, summary } = summarizeSessionSets(embeddedSets);

      return {
        sessionKey,
        sessionId: source.sessionId || source.id,
        id: source.id,
        bodyPart: source.bodyPart,
        exercise: source.exercise,
        date: source.date,
        rows: embeddedSets,
        summary,
        volume,
        setCount: embeddedSets.length
      };
    });

    const previousByExercise = {};
    const decoratedSessions = sessions
      .sort((left, right) => new Date(getWorkoutDate(right)) - new Date(getWorkoutDate(left)))
      .map((session) => {
        const exerciseKey = String(session.exercise || '').toLowerCase();
        const previous = previousByExercise[exerciseKey];
        previousByExercise[exerciseKey] = session;
        return {
          ...session,
          overloadStatus: computeOverloadStatus(previous?.summary, session.summary)
        };
      });

    return decoratedSessions;
  };

  const groupedWorkouts = useMemo(() => decorateWorkouts(workouts), [workouts]);

  useEffect(() => {
    // Load from Neon (falls back to existing localStorage on error)
    let mounted = true;
    (async () => {
      try {
        const ws = await fetchWorkouts();
        const ex = await fetchCustomExercises();
        if (!mounted) return;
        setWorkouts(ws || []);
        setSavedExercises(ex.grouped || {});
      } catch (err) {
        console.error('Neon load failed, falling back to localStorage', err);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bodyPart || !exercise) return;

    const hasSingleSetValues = weight !== '' && reps !== '';
    const hasBulkValues = weight !== '' && reps !== '' && bulkSetCount !== '';
    const hasManualSets = manualSets.some(setRow => setRow.weight !== '' && setRow.reps !== '');

    if (entryMode === 'single' && !hasSingleSetValues) return;
    if (entryMode === 'bulk' && !hasBulkValues) return;
    if (entryMode === 'manual' && !hasManualSets) return;

    const sessionId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const sets = entryMode === 'bulk'
      ? normalizeSetRows(
          Array.from({ length: Math.max(1, parseInt(bulkSetCount, 10) || 1) }, () => ({ weight, reps, notes })),
          notes || ''
        )
      : entryMode === 'manual'
        ? normalizeSetRows(manualSets, notes || '')
        : normalizeSetRows([{ weight, reps, notes }], notes || '');

    if (sets.length === 0) return;

    const { volume, summary } = summarizeSessionSets(sets);
    const previousSession = groupedWorkouts.find(session => String(session.exercise || '').toLowerCase() === exercise.toLowerCase());
    const overloadStatus = computeOverloadStatus(previousSession?.summary, summary);

    const sessionPayload = {
      sessionId,
      bodyPart,
      exercise,
      weight: summary?.weight ?? parseFloat(weight),
      reps: summary?.reps ?? parseInt(reps, 10),
      notes: notes || '',
      sets,
      setCount: sets.length,
      volume,
      overloadStatus
    };

    try {
      const saved = await saveWorkout(sessionPayload);
      if (saved) setWorkouts(prev => [saved, ...prev]);
    } catch (err) {
      console.error('Save workout failed, storing locally', err);
      const mapped = {
        id: `${Date.now()}`,
        sessionId,
        date: new Date().toISOString(),
        bodyPart,
        exercise,
        weight: sessionPayload.weight,
        reps: sessionPayload.reps,
        notes: sessionPayload.notes,
        sets,
        setCount: sets.length,
        volume,
        overloadStatus
      };
      setWorkouts(prev => [mapped, ...prev]);
    }
    setWeight('');
    setReps('');
    setNotes('');
    setBulkSetCount(3);
    setManualSets([{ weight: '', reps: '', notes: '' }]);
    setEntryMode('single');
  };

  const deleteWorkout = async (id) => {
    try {
      await deleteWorkoutById(id);
      setWorkouts(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      console.error('Delete workout failed, removing locally', err);
      setWorkouts(prev => prev.filter(w => w.id !== id));
    }
  };

  const uniqueBodyParts = useMemo(() => [...new Set(workouts.map(w => w.bodyPart))], [workouts]);
  const uniqueExercises = useMemo(() => [...new Set(workouts.map(w => w.exercise))], [workouts]);

  const filtered = groupedWorkouts.filter(session => {
    if (filterBodyPart && session.bodyPart !== filterBodyPart) return false;
    if (filterExercise && session.exercise !== filterExercise) return false;
    if (search) {
      const s = search.toLowerCase();
      const haystack = [session.exercise, session.bodyPart, ...session.rows.map(row => row.notes || '')].join(' ').toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });
  // Group filtered sessions by calendar day (yyyy-MM-dd)
  const groupedByDay = useMemo(() => {
    const map = new Map();
    filtered.forEach(session => {
      const dayKey = format(new Date(session.date), 'yyyy-MM-dd');
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey).push(session);
    });
    const entries = Array.from(map.entries()).map(([day, sessions]) => {
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      return [day, sessions];
    });
    entries.sort((a, b) => new Date(b[0]) - new Date(a[0]));
    return entries; // [ [dayKey, sessions], ... ]
  }, [filtered]);
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
      const bestSet = w.summary || w.sets?.[0] || { weight: w.weight, reps: w.reps };
      if (!map[w.exercise]) map[w.exercise] = { best: 0, volume: 0 };
      if (bestSet.weight > map[w.exercise].best) map[w.exercise].best = bestSet.weight;
      map[w.exercise].volume += Number(w.volume || 0);
    });
    return map;
  }, [workouts]);

  const dashboard = useMemo(() => {
    const totalSessions = groupedWorkouts.length;
    const totalSets = groupedWorkouts.reduce((total, session) => total + (session.setCount || session.rows?.length || 0), 0);
    const totalVolume = groupedWorkouts.reduce((total, session) => total + Number(session.volume || 0), 0);
    const activeDays = new Set(groupedWorkouts.map(session => format(new Date(session.date), 'yyyy-MM-dd'))).size;
    const lastSession = groupedWorkouts[0] || null;

    const bodyPartCounts = groupedWorkouts.reduce((acc, session) => {
      acc[session.bodyPart] = (acc[session.bodyPart] || 0) + 1;
      return acc;
    }, {});

    const dominantBodyPart = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1])[0] || ['-','-'];

    return {
      totalSessions,
      totalSets,
      totalVolume,
      activeDays,
      lastSession,
      dominantBodyPart: dominantBodyPart[0],
      dominantBodyPartCount: dominantBodyPart[1] || 0,
      recentSessions: groupedWorkouts.slice(0, 3)
    };
  }, [groupedWorkouts]);

  const startEdit = (session) => {
    setEditingId(session.id);
    setEditFields({
      bodyPart: session.bodyPart,
      exercise: session.exercise,
      weight: session.summary?.weight ?? session.rows?.[0]?.weight ?? '',
      reps: session.summary?.reps ?? session.rows?.[0]?.reps ?? '',
      notes: session.notes || ''
    });
  };

  const saveEdit = async (id) => {
    const currentSession = groupedWorkouts.find(session => session.id === id);
    const preservedSets = currentSession?.rows || [];
    const sessionWeight = currentSession?.summary?.weight ?? editFields.weight;
    const sessionReps = currentSession?.summary?.reps ?? editFields.reps;
    const updatedWorkout = {
      bodyPart: editFields.bodyPart,
      exercise: editFields.exercise,
      weight: parseFloat(sessionWeight),
      reps: parseInt(sessionReps),
      notes: editFields.notes || '',
      sessionId: currentSession?.sessionId || currentSession?.id,
      sets: preservedSets,
      setCount: preservedSets.length,
      volume: currentSession?.volume || 0,
      overloadStatus: currentSession?.overloadStatus || 'first_time'
    };

    try {
      const saved = await updateWorkout(id, updatedWorkout);
      if (saved) {
        setWorkouts(prev => prev.map(w => (w.id === id ? saved : w)));
      }
    } catch (err) {
      console.error('Update workout failed, storing locally', err);
      setWorkouts(prev => prev.map(w => (w.id === id ? { ...w, ...updatedWorkout } : w)));
    }
    setEditingId(null);
    setEditFields({});
  };

  const cancelEdit = () => { setEditingId(null); setEditFields({}); };

  const updateManualSet = (index, field, value) => {
    setManualSets(prev => prev.map((setRow, setIndex) => (
      setIndex === index ? { ...setRow, [field]: value } : setRow
    )));
  };

  const addManualSet = () => {
    setManualSets(prev => [...prev, { weight: '', reps: '', notes: '' }]);
  };

  const removeManualSet = (index) => {
    setManualSets(prev => prev.filter((_, setIndex) => setIndex !== index));
  };

  const resetWorkoutForm = () => {
    setWeight('');
    setReps('');
    setNotes('');
    setBulkSetCount(3);
    setManualSets([{ weight: '', reps: '', notes: '' }]);
    setEntryMode('single');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.12),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#eef3fb_48%,_#f7fafc_100%)] px-4 py-4 sm:px-6 sm:py-6 font-sans text-slate-900">
      <header className="max-w-7xl mx-auto mb-4 sm:mb-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.95),rgba(30,41,59,0.95))]" />
          <div className="absolute -right-12 top-0 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute left-0 bottom-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid gap-4 px-5 py-5 sm:px-6 sm:py-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/15 backdrop-blur-md">
                <Dumbbell className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Performance dashboard
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">Gym Progress</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
                  Dashboard latihan yang fokus ke progres, volume, dan consistency. Lebih rapi, lebih informatif, lebih siap buat dipakai harian.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:justify-self-end xl:min-w-[24rem]">
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-xs font-medium uppercase tracking-[0.14em]">Total volume</span>
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="mt-3 text-2xl font-semibold">{Math.round(dashboard.totalVolume).toLocaleString('id-ID')}</div>
                <div className="mt-1 text-xs text-white/60">Workload keseluruhan</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-xs font-medium uppercase tracking-[0.14em]">Active days</span>
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="mt-3 text-2xl font-semibold">{dashboard.activeDays}</div>
                <div className="mt-1 text-xs text-white/60">Hari latihan tercatat</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-xs font-medium uppercase tracking-[0.14em]">Last session</span>
                  <TimerReset className="h-4 w-4" />
                </div>
                <div className="mt-3 text-lg font-semibold">{dashboard.lastSession ? dashboard.lastSession.exercise : '-'}</div>
                <div className="mt-1 text-xs text-white/60">{dashboard.lastSession ? format(new Date(dashboard.lastSession.date), 'dd MMM HH:mm') : 'Belum ada data'}</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-xs font-medium uppercase tracking-[0.14em]">Top body part</span>
                  <Target className="h-4 w-4" />
                </div>
                <div className="mt-3 text-lg font-semibold">{dashboard.dominantBodyPart}</div>
                <div className="mt-1 text-xs text-white/60">{dashboard.dominantBodyPartCount} sesi</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
        <section className="xl:col-span-8 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: 'Sessions', value: dashboard.totalSessions, icon: Layers3, tone: 'from-sky-500 to-cyan-500' },
              { label: 'Total sets', value: dashboard.totalSets, icon: Award, tone: 'from-emerald-500 to-teal-500' },
              { label: 'Volume', value: Math.round(dashboard.totalVolume).toLocaleString('id-ID'), icon: Flame, tone: 'from-amber-500 to-orange-500' },
              { label: 'Consistency', value: `${dashboard.activeDays} hari`, icon: ShieldCheck, tone: 'from-slate-700 to-slate-900' }
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</div>
                      <div className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">{card.value}</div>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${card.tone} text-white shadow-lg`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-md">
            <div className="flex flex-col gap-4 border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                    <Activity className="h-3.5 w-3.5" />
                    Input session
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Tambah latihan</h2>
                  <p className="mt-1 text-sm text-slate-500">Mode single, bulk, atau manual untuk input cepat yang tetap presisi.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input placeholder="Cari latihan..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-64 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
                <button type="button" onClick={() => setEntryMode('single')} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${entryMode === 'single' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Single</button>
                <button type="button" onClick={() => setEntryMode('bulk')} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${entryMode === 'bulk' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Bulk Sama</button>
                <button type="button" onClick={() => setEntryMode('manual')} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${entryMode === 'manual' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Manual</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 sm:p-5">
              <select value={bodyPart} onChange={e => { setBodyPart(e.target.value); setExercise(''); }} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                {BODY_PARTS.map(bp => <option key={bp} value={bp}>{bp}</option>)}
              </select>
              <div>
                <select value={exercise} onChange={e => setExercise(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="">Pilih gerakan...</option>
                  {exercisesForBodyPart(bodyPart).map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                  <option value="__custom__">-- Gerakan kustom --</option>
                </select>
                {exercise === '__custom__' && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input value={customExerciseName} onChange={e => setCustomExerciseName(e.target.value)} placeholder="Nama gerakan baru" className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                    <button type="button" onClick={() => addCustomExercise(bodyPart, customExerciseName)} className="w-full sm:w-auto rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800">Simpan</button>
                  </div>
                )}
              </div>

              {entryMode === 'single' && (
                <>
                  <input type="number" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Beban (kg)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Repetisi" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-span-2" />
                </>
              )}

              {entryMode === 'bulk' && (
                <>
                  <input type="number" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Beban (kg)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Repetisi per set" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <input type="number" min="1" value={bulkSetCount} onChange={e => setBulkSetCount(e.target.value)} placeholder="Jumlah set" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-span-2" />
                </>
              )}

              {entryMode === 'manual' && (
                <div className="sm:col-span-2 space-y-3">
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan sesi (opsional)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                  <div className="space-y-2">
                    {manualSets.map((setRow, index) => (
                      <div key={index} className="grid grid-cols-1 gap-2 rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.95))] p-3 shadow-sm sm:grid-cols-4">
                        <input type="number" step="0.5" value={setRow.weight} onChange={e => updateManualSet(index, 'weight', e.target.value)} placeholder="Beban (kg)" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input type="number" value={setRow.reps} onChange={e => updateManualSet(index, 'reps', e.target.value)} placeholder="Repetisi" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input value={setRow.notes} onChange={e => updateManualSet(index, 'notes', e.target.value)} placeholder="Catatan set" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-span-2" />
                        <div className="flex items-center gap-2 sm:col-span-4">
                          <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Set {index + 1}</div>
                          {manualSets.length > 1 && (
                            <button type="button" onClick={() => removeManualSet(index)} className="ml-auto rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">Hapus set</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addManualSet} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">Tambah set</button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Layers3 className="h-4 w-4 text-slate-400" />
                Data akan masuk sebagai session yang memuat set, volume, dan status overload.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 sm:w-auto">Simpan Set</button>
                <button type="button" onClick={() => { setBodyPart(''); setExercise(''); resetWorkoutForm(); }} className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto">Reset</button>
              </div>
            </div>
          </form>

          <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-md">
            <div className="flex flex-col gap-4 border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <History className="h-3.5 w-3.5" />
                    Workout history
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Riwayat latihan</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 w-full sm:w-auto">
                  <select value={filterBodyPart} onChange={e => setFilterBodyPart(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="">Semua Body Part</option>
                  {uniqueBodyParts.map(bp => <option key={bp} value={bp}>{bp}</option>)}
                  </select>
                  <select value={filterExercise} onChange={e => setFilterExercise(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="">Semua Latihan</option>
                  {uniqueExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {groupedByDay.length === 0 ? (
              <div className="px-4 py-10 text-center text-gray-400">Tidak ada data.</div>
            ) : (
              <div className="space-y-6 p-4 sm:p-5">
                {groupedByDay.map(([dayKey, sessions]) => (
                  <div key={dayKey} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                      <div className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
                        {format(new Date(dayKey), 'dd MMM yyyy')}
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                    </div>
                    <div className="space-y-3">
                      {sessions.map(session => (
                        <div key={session.sessionKey} className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-3 shadow-sm sm:p-4 space-y-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{session.bodyPart}</span>
                                <h4 className="break-words text-base font-semibold text-slate-900 sm:text-lg">{session.exercise}</h4>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">{session.rows.length} set</span>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">Volume: {Math.round(session.volume)}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500 sm:text-sm">{format(new Date(session.date), 'dd MMM yyyy HH:mm')}</div>
                            </div>

                            <div className="text-left sm:text-right flex flex-col items-stretch sm:items-end gap-2">
                              <div>
                                {session.overloadStatus === 'progress' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><TrendingUp className="w-4 h-4"/> Overload</span>}
                                {session.overloadStatus === 'regress' && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"><TrendingDown className="w-4 h-4"/> Turun</span>}
                                {session.overloadStatus === 'maintain' && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"><Minus className="w-4 h-4"/> Sama</span>}
                                {session.overloadStatus === 'first_time' && <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">Record</span>}
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:w-auto">
                                <button type="button" onClick={() => startEdit(session)} className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:text-sm"><Edit2 className="w-4 h-4"/> Edit</button>
                                <button type="button" onClick={() => deleteWorkout(session.id)} className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 sm:text-sm">Hapus</button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {session.rows.map((setRow, index) => (
                              <div key={`${session.sessionKey}-${index}`} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">Set {setRow.setIndex || index + 1}</div>
                                  <div className="text-sm text-slate-600">{setRow.weight} kg × {setRow.reps} reps</div>
                                  {setRow.notes && <div className="mt-1 break-words text-xs text-slate-500">{setRow.notes}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

                  {editingId && (
                    <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-md">
                      <div className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] p-4 sm:p-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit session
                        </div>
                        <h4 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">Edit Entry</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                        <input value={editFields.bodyPart || ''} onChange={e => setEditFields({...editFields, bodyPart: e.target.value})} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input value={editFields.exercise || ''} onChange={e => setEditFields({...editFields, exercise: e.target.value})} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input value={editFields.weight || ''} onChange={e => setEditFields({...editFields, weight: e.target.value})} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input value={editFields.reps || ''} onChange={e => setEditFields({...editFields, reps: e.target.value})} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                        <input value={editFields.notes || ''} onChange={e => setEditFields({...editFields, notes: e.target.value})} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-span-2" />
                      </div>
                      <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-slate-50/70 p-4 sm:flex-row sm:p-5">
                        <button type="button" onClick={() => saveEdit(editingId)} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 sm:w-auto">Simpan</button>
                        <button type="button" onClick={cancelEdit} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto">Batal</button>
                      </div>
                    </div>
                  )}
        </section>

                <aside className="space-y-4 xl:sticky xl:top-6 self-start xl:col-span-4">
                  <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-md">
                    <div className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] p-4 sm:p-5">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Intelligence panel
                      </div>
                      <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">Statistik & insight</h3>
                    </div>
                    <div className="space-y-4 p-4 sm:p-5">
                      {Object.keys(stats).length === 0 ? (
                        <div className="text-sm text-gray-500">Belum ada data.</div>
                      ) : (
                        <div className="space-y-3 text-sm max-h-64 overflow-auto pr-1">
                          {Object.entries(stats).map(([ex, s]) => (
                            <div key={ex} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
                              <div className="flex flex-col gap-1">
                                <div className="font-medium text-sm break-words text-slate-900">{ex}</div>
                                <div className="text-xs text-slate-600">Best: {s.best} kg · Volume: {Math.round(s.volume)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 p-4 text-white shadow-lg">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                          <Flame className="h-4 w-4" />
                          Quick insight
                        </div>
                        <div className="mt-3 text-sm leading-relaxed text-white/80">
                          Volume terbesar saat ini ada di <span className="font-semibold text-white">{dashboard.dominantBodyPart}</span>, dengan total <span className="font-semibold text-white">{dashboard.dominantBodyPartCount} sesi</span> tercatat.
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900">Recent sessions</h3>
                        <div className="mt-3 space-y-2">
                          {dashboard.recentSessions.length === 0 ? (
                            <div className="text-sm text-slate-500">Belum ada sesi terbaru.</div>
                          ) : dashboard.recentSessions.map(session => (
                            <div key={`recent-${session.sessionKey}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="text-sm font-medium text-slate-900">{session.exercise}</div>
                              <div className="mt-1 text-xs text-slate-500">{session.bodyPart} · {format(new Date(session.date), 'dd MMM HH:mm')}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900">Settings — Gerakan Kustom</h3>
                        {Object.keys(savedExercises).length === 0 ? (
                          <div className="mt-2 text-sm text-gray-500">Belum ada gerakan kustom.</div>
                        ) : (
                          <div className="mt-3 space-y-2 text-sm max-h-72 overflow-auto pr-1">
                            {BODY_PARTS.map(bp => (
                              savedExercises[bp] && savedExercises[bp].length > 0 ? (
                                <div key={bp} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="font-medium text-sm text-slate-900">{bp}</div>
                                  <ul className="mt-2 space-y-2">
                                    {savedExercises[bp].map(name => (
                                      <li key={name} className="flex flex-col gap-2 rounded-xl bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                        <span className="break-words text-slate-700">{name}</span>
                                        <button onClick={() => removeCustomExercise(bp, name)} className="self-start rounded-lg border border-rose-200 bg-white px-2 py-1 text-sm text-rose-600 transition hover:bg-rose-50 sm:self-auto">Hapus</button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
        </aside>
      </main>
    </div>
  );
}