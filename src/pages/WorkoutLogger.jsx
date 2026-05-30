import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, CheckCircle, XCircle, Search, Trash2, ArrowLeft, Dumbbell, Shield, Activity, Zap, Flame, Target, Heart, Save } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Toast from '../components/Toast';

const CategoryIcon = ({ category, size = 16 }) => {
  const props = { size, color: "var(--accent-cyan)", style: { marginRight: '10px' } };
  switch (category) {
    case 'Arms': return <Dumbbell {...props} />;
    case 'Chest': return <Shield {...props} />;
    case 'Back': return <Activity {...props} />;
    case 'Shoulders': return <Zap {...props} />;
    case 'Legs': return <Flame {...props} />;
    case 'Core': return <Target {...props} />;
    case 'Cardio': return <Heart {...props} />;
    default: return <Dumbbell {...props} />;
  }
};

// ─── Small sub-components ─────────────────────────────────────────────────────
function SetRow({ set, index, onUpdate, onRemove }) {
  return (
    <div className="wl-set-row">
      <span className="wl-set-num">{index + 1}</span>
      <input
        className="wl-set-input"
        type="number"
        min="0"
        placeholder="kg"
        value={set.weight}
        onChange={e => onUpdate(index, 'weight', e.target.value)}
        id={`set-weight-${index}`}
      />
      <span className="wl-set-x">×</span>
      <input
        className="wl-set-input"
        type="number"
        min="0"
        placeholder="reps"
        value={set.reps}
        onChange={e => onUpdate(index, 'reps', e.target.value)}
        id={`set-reps-${index}`}
      />
      <button className="wl-set-remove" onClick={() => onRemove(index)} aria-label="Remove set">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ExerciseCard({ ex, exIndex, onAddSet, onUpdateSet, onRemoveSet, onRemoveExercise }) {
  return (
    <div className="wl-exercise-card animate-slide-up">
      <div className="wl-exercise-card-header">
        <span className="wl-exercise-name">{ex.name}</span>
        <button
          className="wl-remove-exercise"
          onClick={() => onRemoveExercise(exIndex)}
          aria-label="Remove exercise"
        >
          <X size={16} />
        </button>
      </div>

      {/* Column labels */}
      <div className="wl-set-labels">
        <span className="wl-label-set">Set</span>
        <span className="wl-label-weight">Weight (kg)</span>
        <span className="wl-label-reps">Reps</span>
        <span />
      </div>

      {ex.sets.map((set, si) => (
        <SetRow
          key={si}
          set={set}
          index={si}
          onUpdate={(i, field, val) => onUpdateSet(exIndex, i, field, val)}
          onRemove={i => onRemoveSet(exIndex, i)}
        />
      ))}

      <button
        className="wl-add-set-btn"
        onClick={() => onAddSet(exIndex)}
        id={`add-set-${exIndex}`}
      >
        <Plus size={14} /> Add Set
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WorkoutLogger() {
  const navigate = useNavigate();
  const [dbExerciseList, setDbExerciseList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [toastInfo, setToastInfo] = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [username, setUsername] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Timer
  const [elapsed, setElapsed] = useState(() => {
    const saved = localStorage.getItem('workout_elapsed');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  useEffect(() => {
    localStorage.setItem('workout_elapsed', elapsed.toString());
  }, [elapsed]);
  const timerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const checkWorkoutStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (isMounted) navigate('/');
          return;
        }

        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (isMounted) setUsername(localUser.username || session.user.email.split('@')[0]);

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${date}`;

        const { data, error } = await supabase
          .from('activity_logs')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('activity_date', todayStr)
          .eq('activity_type', 'workout')
          .maybeSingle();

        if (data && isMounted) {
          setAlreadyCompleted(true);
        }
      } catch (err) {
        console.error("Error checking workout status:", err);
      } finally {
        if (isMounted) setCheckingStatus(false);
      }
    };
    checkWorkoutStatus();
    return () => { isMounted = false; };
  }, [navigate]);

  const formatTime = useCallback(secs => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m} : ${s}`;
  }, []);

  // Exercise search dropdown
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [exercises, setExercises] = useState(() => {
    const saved = localStorage.getItem('workout_exercises');
    return saved ? JSON.parse(saved) : [];
  });
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('workout_exercises', JSON.stringify(exercises));
  }, [exercises]);

  // Fetch exercises from Supabase
  useEffect(() => {
    const fetchExercises = async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('name, target_muscle_group')
        .order('name', { ascending: true });
      
      if (data) {
        setDbExerciseList(data);
      } else if (error) {
        console.error('Error fetching exercises:', error);
      }
    };
    fetchExercises();
  }, []);

  // Timer only counts if at least one exercise exists or time is already running
  useEffect(() => {
    if (exercises.length > 0 || elapsed > 0) {
      const interval = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [exercises.length, elapsed]);

  const categories = ['Arms', 'Chest', 'Back', 'Shoulders', 'Legs', 'Core', 'Cardio'];

  let dropdownItems = [];
  if (searchQuery.trim().length > 0) {
    dropdownItems = dbExerciseList
      .filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(e => ({ type: 'exercise', name: e.name }));
  } else if (selectedCategory) {
    dropdownItems = dbExerciseList
      .filter(e => e.target_muscle_group === selectedCategory)
      .map(e => ({ type: 'exercise', name: e.name }));
  } else {
    dropdownItems = categories.map(c => ({ type: 'category', name: c }));
  }

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length > 0) {
      setSelectedCategory(null);
    }
  };

  const handleAddExerciseClick = () => {
    setShowDropdown(true);
    setSearchQuery('');
    setSelectedCategory(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleDropdownClick = (item) => {
    console.log('Category Clicked:', item.name);
    if (item.type === 'category') {
      setSelectedCategory(item.name);
      setSearchQuery('');
    } else {
      setExercises(prev => [...prev, { name: item.name, sets: [{ weight: '', reps: '' }] }]);
      setShowDropdown(false);
      setSearchQuery('');
      setSelectedCategory(null);
    }
  };

  const handleCloseSearch = () => {
    setShowDropdown(false);
    setSelectedCategory(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Set management
  const addSet = exIndex => {
    setExercises(prev => prev.map((ex, i) => {
      if (i === exIndex) {
        const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : { weight: '', reps: '' };
        return { ...ex, sets: [...ex.sets, { ...lastSet }] };
      }
      return ex;
    }));
  };

  const updateSet = (exIndex, setIndex, field, val) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIndex) return ex;
      const sets = ex.sets.map((s, si) =>
        si === setIndex ? { ...s, [field]: val } : s
      );
      return { ...ex, sets };
    }));
  };

  const removeSet = (exIndex, setIndex) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIndex) return ex;
      const sets = ex.sets.filter((_, si) => si !== setIndex);
      return { ...ex, sets: sets.length ? sets : [{ weight: '', reps: '' }] };
    }));
  };

  const removeExercise = exIndex => {
    setExercises(prev => prev.filter((_, i) => i !== exIndex));
  };

  // Auto-scroll when an exercise or set is added
  const totalItems = exercises.length + exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  useEffect(() => {
    if (scrollAreaRef.current) {
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  }, [totalItems]);

  // Cancel / Finish
  const clearSavedWorkout = () => {
    localStorage.removeItem('workout_elapsed');
    localStorage.removeItem('workout_exercises');
  };

  const handleCancel = () => {
    clearInterval(timerRef.current);
    clearSavedWorkout();
    navigate('/exercise');
  };

  const handleSave = () => {
    setToastInfo({ title: "Progress Saved!", message: "You can come back later to finish your workout." });
    setTimeout(() => navigate('/home'), 1500);
  };

  const isWorkoutValid = exercises.length > 0 && exercises.every(ex => 
    ex.sets.length > 0 && ex.sets.every(set => set.weight !== '' && set.reps !== '')
  );

  const handleFinish = async () => {
    if (!isWorkoutValid) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get old level
      const { data: oldProfile } = await supabase
        .from('profiles')
        .select('level')
        .eq('id', session.user.id)
        .single();

      const getLocalDateStr = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${date}`;
      };

      const { data, error } = await supabase.rpc('log_workout', { 
        p_workout_data: exercises,
        p_client_date: getLocalDateStr()
      });

      if (error) {
        console.error('Workout log error:', error);
        alert('Error logging workout: ' + error.message);
      } else if (data?.success === false) {
        alert(data.error);
      } else {
        // Success
        const { data: newProfile } = await supabase
          .from('profiles')
          .select('level')
          .eq('id', session.user.id)
          .single();

        clearInterval(timerRef.current);
        clearSavedWorkout();
        
        const prsHit = Array.isArray(data.prs_hit) ? data.prs_hit : [];
        
        navigate('/home', {
          state: {
            workoutFinished: true,
            xpEarned: data.xp_earned,
            levelUp: (newProfile && oldProfile && newProfile.level > oldProfile.level) ? newProfile.level : false,
            prsHit,
            prXp: data.pr_xp || 0,
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const renderSearchDropdown = () => (
    <div className="wl-search-wrapper" ref={dropdownRef}>
      {showDropdown ? (
        <div className="wl-search-box animate-slide-up">
          <div className="wl-search-input-row">
            <Search size={16} className="wl-search-icon" />
            <input
              ref={searchRef}
              id="exercise-search-input"
              className="wl-search-input"
              type="text"
              placeholder="Search exercise…"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            <button
              className="wl-search-close"
              onClick={handleCloseSearch}
              aria-label="Close search"
            >
              <X size={16} />
            </button>
          </div>
          <ul className="wl-dropdown-list" id="exercise-dropdown-list">
            {selectedCategory && !searchQuery && (
              <li 
                className="wl-dropdown-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedCategory(null);
                }}
                style={{ fontWeight: '600', color: 'var(--accent-cyan)' }}
              >
                <ArrowLeft size={16} style={{ marginRight: '8px' }} />
                Back to Categories
              </li>
            )}
            
            {dropdownItems.length > 0 ? (
              dropdownItems.map(item => (
                <li
                  key={item.name}
                  className="wl-dropdown-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDropdownClick(item);
                  }}
                >
                  {item.type === 'category' ? (
                    <span style={{ fontWeight: '500', display: 'flex', alignItems: 'center' }}>
                       <CategoryIcon category={item.name} /> <span>{item.name}</span>
                    </span>
                  ) : (
                    <><Plus size={14} className="wl-dropdown-plus" /> {item.name}</>
                  )}
                </li>
              ))
            ) : (
              <li className="wl-dropdown-empty">No exercises found</li>
            )}
          </ul>
        </div>
      ) : (
        <button
          className="wl-add-exercise-btn"
          id="add-exercise-btn"
          onClick={handleAddExerciseClick}
        >
          <Plus size={18} />
          + Add Exercise
        </button>
      )}
    </div>
  );

  const renderActions = () => (
    <div className="wl-actions animate-slide-up" style={{ gap: '8px', flexWrap: 'nowrap' }}>
      <button className="wl-btn-cancel" id="cancel-workout-btn" onClick={handleCancel} style={{ padding: '12px 10px', flex: 1 }}>
        <XCircle size={18} />
        Cancel
      </button>
      <button 
        className="wl-btn-save" 
        id="save-workout-btn" 
        onClick={handleSave}
        style={{ 
          flex: 1,
          padding: '12px 10px',
          borderRadius: '12px',
          border: '1px solid var(--accent-cyan)',
          background: 'rgba(102, 252, 241, 0.1)',
          color: 'var(--accent-cyan)',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          cursor: 'pointer'
        }}
      >
        <Save size={18} />
        Save
      </button>
      <button 
        className="wl-btn-finish" 
        id="finish-workout-btn" 
        onClick={handleFinish}
        disabled={!isWorkoutValid}
        style={{ padding: '12px 10px', flex: 1, opacity: isWorkoutValid ? 1 : 0.5, cursor: isWorkoutValid ? 'pointer' : 'not-allowed' }}
      >
        <CheckCircle size={18} />
        Finish
      </button>
    </div>
  );

  if (checkingStatus) {
    return (
      <div className="wl-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ color: 'var(--accent-cyan)' }}>Loading Logger...</div>
      </div>
    );
  }

  if (alreadyCompleted) {
    return (
      <div className="wl-page animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '20px' }}>
        <div className="wl-header">
          <button className="wl-back-btn" onClick={() => navigate('/exercise')} aria-label="Go back">
            <ArrowLeft size={24} />
          </button>
          <h2>Workout Logger</h2>
        </div>
        
        <div className="rest-popup-overlay" style={{ position: 'absolute', zIndex: 10 }}>
          <div className="rest-popup animate-scale-up" style={{ padding: '40px 32px' }}>
            <div className="rest-popup-icon" style={{ fontSize: '56px', marginBottom: '10px' }}>🏆</div>
            <div className="rest-popup-title" style={{ fontSize: '22px' }}>Workout Complete</div>
            <div className="rest-popup-message" style={{ margin: '16px 0', fontSize: '16px' }}>
              <strong>{username}</strong>, you have already crushed your workout for today! Awesome job! 👊
            </div>
            <button className="rest-popup-btn" onClick={() => navigate('/')} style={{ marginTop: '16px' }}>
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wl-page" style={{ position: 'relative' }}>
      {toastInfo && (
        <Toast
          title={toastInfo.title}
          message={toastInfo.message}
          onClose={() => setToastInfo(null)}
        />
      )}
      
      {/* ── Back button ── */}
      <button className="wl-back-btn" onClick={() => navigate('/exercise')} aria-label="Go back">
        <ArrowLeft size={20} />
      </button>

      {/* ── Header ── */}
      <div className="wl-header animate-slide-up">
        <h1 className="wl-title">Workout In Progress 💪</h1>
      </div>

      {exercises.length === 0 ? (
        <div className="wl-empty-state">
          {renderSearchDropdown()}
          <div style={{ marginTop: 'auto', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {renderActions()}
          </div>
        </div>
      ) : (
        <>
          {/* ── Scrollable Exercise cards ── */}
          <div className="wl-scroll-area" id="wl-scroll-area" ref={scrollAreaRef}>
            <div className="wl-timer animate-slide-up">
              <span className="wl-timer-icon">⏱</span>
              <span className="wl-timer-display">{formatTime(elapsed)}</span>
            </div>

            <div className="wl-exercises-list">
              {exercises.map((ex, i) => (
                <ExerciseCard
                  key={i}
                  ex={ex}
                  exIndex={i}
                  onAddSet={addSet}
                  onUpdateSet={updateSet}
                  onRemoveSet={removeSet}
                  onRemoveExercise={removeExercise}
                />
              ))}
            </div>
          </div>

          {/* ── Fixed Bottom Actions ── */}
          <div className="wl-bottom-bar">
            {renderSearchDropdown()}
            {renderActions()}
          </div>
        </>
      )}
    </div>
  );
}
