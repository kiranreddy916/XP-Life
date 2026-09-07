import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Flame, Trophy, Calendar, X, Dumbbell } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../lib/cacheManager';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function WorkoutTracker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const friendId = searchParams.get('friendId');
  const cacheKeySuffix = friendId || 'my';

  const now = new Date();
  const [anchorDate, setAnchorDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const [loading, setLoading] = useState(() => !getCache(`tracker_logs_${cacheKeySuffix}`));
  const [profile, setProfile] = useState(() => getCache(`tracker_profile_${cacheKeySuffix}`) || null);
  const [logs, setLogs] = useState(() => getCache(`tracker_logs_${cacheKeySuffix}`) || {});
  const [targetUserId, setTargetUserId] = useState(null);

  // States for interactive day modal
  const [selectedDay, setSelectedDay] = useState(null);
  const [workoutDetails, setWorkoutDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Helper to format date in YYYY-MM-DD local format
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const todayStr = getLocalDateStr();

  const createdDate = profile?.created_at ? new Date(profile.created_at) : null;
  const accountCreatedDateStr = createdDate ? getLocalDateStr(createdDate) : null;

  useEffect(() => {
    const initTracker = async () => {
      try {
        if (!getCache(`tracker_logs_${cacheKeySuffix}`)) setLoading(true);
        // Get session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate('/', { replace: true });
          return;
        }

        const uid = friendId || session.user.id;
        setTargetUserId(uid);

        // Fetch profile (username, created_at)
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('username, created_at')
          .eq('id', uid)
          .maybeSingle();

        if (profileErr) throw profileErr;
        setProfile(profileData);
        setCache(`tracker_profile_${cacheKeySuffix}`, profileData);

        const accDate = profileData?.created_at ? new Date(profileData.created_at) : createdDate;
        const startDateStr = accDate ? getLocalDateStr(accDate) : getLocalDateStr(new Date(now.getFullYear(), now.getMonth() - 11, 1));
        const endMonthDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
        const endDateStr = getLocalDateStr(endMonthDate);

        // Fetch activity logs from account creation date to anchor end month
        const { data: logsData, error: logsErr } = await supabase
          .from('activity_logs')
          .select('activity_date, activity_type')
          .eq('user_id', uid)
          .gte('activity_date', startDateStr)
          .lte('activity_date', endDateStr);

        if (logsErr) throw logsErr;

        // Map logs to a date key map for instant lookups
        const logsMap = {};
        if (logsData) {
          logsData.forEach(log => {
            if (log.activity_type === 'workout') {
              logsMap[log.activity_date] = 'workout';
            } else if (log.activity_type === 'rest' && logsMap[log.activity_date] !== 'workout') {
              logsMap[log.activity_date] = 'rest';
            }
          });
        }
        setLogs(logsMap);
        setCache(`tracker_logs_${cacheKeySuffix}`, logsMap);

      } catch (err) {
        console.error("Failed to load workout tracker data:", err);
      } finally {
        setLoading(false);
      }
    };

    initTracker();
  }, [friendId, anchorDate, navigate]);

  // Lock body scroll when popup is active
  useEffect(() => {
    if (selectedDay) {
      document.body.style.overflow = 'hidden';
      // Fallback lock for iOS Safari standalone/PWA scroll
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedDay]);

  // Click handler for calendar days
  const handleDayClick = async (dateStr, statusClass, dayNum, monthName) => {
    if (!statusClass) return; // Future/pre-account days: do nothing
    
    setSelectedDay({ dateStr, statusClass, dayNum, monthName });
    
    if (statusClass === 'active-green') {
      try {
        setLoadingDetails(true);
        setWorkoutDetails(null);
        
        // 1. Fetch activity log for the XP earned
        const { data: log, error: logErr } = await supabase
          .from('activity_logs')
          .select('id, xp_earned')
          .eq('user_id', targetUserId)
          .eq('activity_date', dateStr)
          .eq('activity_type', 'workout')
          .maybeSingle();
          
        if (logErr) throw logErr;
        
        if (!log) {
          setWorkoutDetails({ xp: 30, exercises: [] });
          return;
        }

        // 2. Fetch workout exercises details
        const { data: exercisesData, error: exercisesErr } = await supabase
          .from('workout_exercises')
          .select('exercise_name, sets')
          .eq('activity_log_id', log.id);
          
        if (exercisesErr) throw exercisesErr;
        
        setWorkoutDetails({
          xp: log.xp_earned || 30,
          exercises: exercisesData || []
        });
      } catch (err) {
        console.error("Error loading day workout details:", err);
      } finally {
        setLoadingDetails(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--accent-cyan)' }}>
        <div style={{ fontSize: '16px' }}>Loading Workout Tracker...</div>
      </div>
    );
  }

  // Dynamically generate months to render, starting at anchorDate (capped at current month) and stopping at createdDate's month/year
  const generateMonthsToRender = (anchor, cDate) => {
    const months = [];
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();

    // Cap anchor at current month (never render future/upcoming months)
    let baseYear = anchor.getFullYear();
    let baseMonth = anchor.getMonth();
    if (baseYear > nowYear || (baseYear === nowYear && baseMonth > nowMonth)) {
      baseYear = nowYear;
      baseMonth = nowMonth;
    }

    const createdYr = cDate ? cDate.getFullYear() : baseYear;
    const createdM = cDate ? cDate.getMonth() : 0;

    // Up to 12 months maximum, stopping strictly at account creation month/year
    for (let i = 0; i < 12; i++) {
      const d = new Date(baseYear, baseMonth - i, 1);
      const yr = d.getFullYear();
      const m = d.getMonth();

      // Stop if month/year is prior to account creation month/year
      if (yr < createdYr || (yr === createdYr && m < createdM)) {
        break;
      }

      const name = `${MONTH_NAMES_FULL[m]} ${yr}`;
      months.push({ year: yr, month: m, name });
    }

    if (months.length === 0) {
      months.push({ year: baseYear, month: baseMonth, name: `${MONTH_NAMES_FULL[baseMonth]} ${baseYear}` });
    }

    return months;
  };

  const monthsToRender = generateMonthsToRender(anchorDate, createdDate);

  const createdYr = createdDate ? createdDate.getFullYear() : now.getFullYear();
  const createdM = createdDate ? createdDate.getMonth() : 0;
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  const handleDateSelect = (newMonth, newYear) => {
    let clampedYear = Math.min(Math.max(newYear, createdYr), nowYear);
    let minM = (clampedYear === createdYr) ? createdM : 0;
    let maxM = (clampedYear === nowYear) ? nowMonth : 11;
    let clampedMonth = Math.min(Math.max(newMonth, minM), maxM);

    setSelectedMonth(clampedMonth);
    setSelectedYear(clampedYear);

    const newAnchor = new Date(clampedYear, clampedMonth, 1);
    setAnchorDate(newAnchor);

    const found = monthsToRender.find(m => m.year === clampedYear && m.month === clampedMonth);
    if (found) {
      const elem = document.getElementById(`month-card-${clampedYear}-${clampedMonth}`);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setTimeout(() => {
        const elem = document.getElementById(`month-card-${clampedYear}-${clampedMonth}`);
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 350);
    }
  };

  // Restrict year options strictly between account creation year and current year (no future years)
  const minYear = createdYr;
  const maxYear = nowYear;
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions.push(y);
  }

  // Restrict month options between creation month (for creation year) and current month (for current year)
  const minMonthIndex = (selectedYear === createdYr) ? createdM : 0;
  const maxMonthIndex = (selectedYear === nowYear) ? nowMonth : 11;
  const availableMonthOptions = MONTH_NAMES_FULL
    .map((name, idx) => ({ name, idx }))
    .filter(m => m.idx >= minMonthIndex && m.idx <= maxMonthIndex);

  const weekdayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px', background: 'var(--bg-color)', minHeight: '100vh', position: 'relative' }}>
      
      {/* Top Header Section */}
      <div className="profile-header" style={{ textAlign: 'center', paddingTop: 'calc(28px + env(safe-area-inset-top, 0px))', paddingBottom: '16px', position: 'relative' }}>
        <button 
          className="badges-back-btn" 
          onClick={() => navigate(-1)} 
          style={{ 
            position: 'absolute', 
            top: 'calc(24px + env(safe-area-inset-top, 0px))', 
            left: '16px', 
            color: 'var(--text-primary)', 
            border: 'none', 
            background: 'rgba(255,255,255,0.06)', 
            cursor: 'pointer',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5
          }}
        >
          <ArrowLeft size={20} />
        </button>
        
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(102, 252, 241, 0.08)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan-dim)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', gap: '6px' }}>
          <Calendar size={14} />
          Workout Tracker
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: '2px 0 2px 0' }}>
          {friendId ? `@${profile?.username?.replace('@', '')}'s Tracker` : 'My Tracker'}
        </h2>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Overall Progress History
        </div>
      </div>

      {/* Spacing container to fit screen perfectly */}
      <div style={{ padding: '0 20px', maxWidth: '440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Month / Year Quick Jump Selector */}
        <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Calendar size={15} />
            <span>Select Date</span>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Month Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => handleDateSelect(Number(e.target.value), selectedYear)}
              style={{
                background: '#141822',
                color: '#fff',
                border: '1px solid var(--accent-cyan)',
                borderRadius: '10px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {availableMonthOptions.map(({ name, idx }) => (
                <option key={idx} value={idx} style={{ background: '#141822', color: '#fff' }}>
                  {name}
                </option>
              ))}
            </select>

            {/* Year Selector */}
            <select
              value={selectedYear}
              onChange={(e) => handleDateSelect(selectedMonth, Number(e.target.value))}
              style={{
                background: '#141822',
                color: '#fff',
                border: '1px solid var(--accent-cyan)',
                borderRadius: '10px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr} style={{ background: '#141822', color: '#fff' }}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Colors/Legend Card */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Streak Color Legend
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="day-circle active-green" style={{ width: '24px', height: '24px', fontSize: '10px' }}>✓</div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Workout Done</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="day-circle active-cyan" style={{ width: '24px', height: '24px', fontSize: '10px' }}>😴</div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Rest Taken</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="day-circle active-red" style={{ width: '24px', height: '24px', fontSize: '10px' }}>✗</div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Missed Day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="day-circle" style={{ width: '24px', height: '24px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Yet to Come</span>
            </div>
          </div>
        </div>

        {/* Render Months */}
        {monthsToRender.map(({ year, month, name: monthName }) => {
          // Number of days in the month
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          
          // Weekday index of the 1st of the month (0 = Sun, 1 = Mon...)
          const firstDayIndex = new Date(year, month, 1).getDay();
          
          // Map JS index (0=Sun, 1=Mon...) to our calendar header (0=Mon, 1=Tue... 6=Sun)
          const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

          // Generate day array containing offset slots + actual days
          const cells = [];
          for (let i = 0; i < startOffset; i++) {
            cells.push({ isOffset: true });
          }
          for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ isOffset: false, dayNum: d });
          }

          return (
            <div 
              className="glass-panel" 
              key={`${year}-${month}`} 
              id={`month-card-${year}-${month}`} 
              style={{ padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', scrollMarginTop: '20px' }}
            >
              {/* Month Header */}
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                {monthName}
              </h3>

              {/* Grid Layout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', justifyItems: 'center' }}>
                {/* Weekday Labels */}
                {weekdayHeaders.map((h, i) => (
                  <div key={i} style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '4px', width: '100%', textAlign: 'center' }}>
                    {h}
                  </div>
                ))}

                {/* Day Cells */}
                {cells.map((cell, idx) => {
                  if (cell.isOffset) {
                    return <div key={`offset-${idx}`} style={{ width: '100%', aspectRatio: '1 / 1' }} />;
                  }

                  const dayNum = cell.dayNum;
                  // Construct standard date string: YYYY-MM-DD
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  
                  // Hide days prior to account creation date
                  if (accountCreatedDateStr && dateStr < accountCreatedDateStr) {
                    return <div key={`pre-account-${dayNum}`} style={{ width: '100%', aspectRatio: '1 / 1' }} />;
                  }

                  const isFuture = dateStr > todayStr;
                  let statusClass = '';
                  
                  if (isFuture) {
                    statusClass = ''; // Future day (empty white outline)
                  } else {
                    const type = logs[dateStr];
                    if (type === 'workout') {
                      statusClass = 'active-green';
                    } else if (type === 'rest') {
                      statusClass = 'active-cyan';
                    } else {
                      statusClass = 'active-red'; // Missed day
                    }
                  }

                  return (
                    <div 
                      key={`day-${dayNum}`}
                      className={`day-circle ${statusClass}`}
                      onClick={() => handleDayClick(dateStr, statusClass, dayNum, monthName)}
                      style={{ 
                        width: '100%', 
                        aspectRatio: '1 / 1', 
                        height: 'auto',
                        fontSize: '12px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        border: statusClass ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                        background: statusClass ? undefined : 'transparent',
                        color: statusClass ? undefined : 'var(--text-secondary)',
                        cursor: statusClass ? 'pointer' : 'default'
                      }}
                    >
                      {dayNum}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Day Details Modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)} style={{ zIndex: 2000 }}>
          <div 
            className="settings-modal animate-slide-up" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '360px', 
              borderRadius: '24px', 
              padding: '24px', 
              margin: 'auto',
              border: '1px solid var(--glass-border)',
              background: '#1a1f2b'
            }}
          >
            <div className="modal-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {selectedDay.monthName.split(' ')[0]} {selectedDay.dayNum}, 2026
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '2px 0 0 0' }}>
                  {selectedDay.statusClass === 'active-green' && 'Workout Day'}
                  {selectedDay.statusClass === 'active-cyan' && 'Rest Day'}
                  {selectedDay.statusClass === 'active-red' && 'Missed Day'}
                </h3>
              </div>
              <button 
                className="close-modal" 
                onClick={() => setSelectedDay(null)} 
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: 'none', 
                  color: 'var(--text-secondary)', 
                  width: '30px', 
                  height: '30px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer' 
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content for GREEN - WORKOUT */}
            {selectedDay.statusClass === 'active-green' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {loadingDetails ? (
                  <div style={{ color: 'var(--accent-cyan)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                    Loading exercises...
                  </div>
                ) : workoutDetails ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(57, 255, 20, 0.06)', border: '1px solid rgba(57, 255, 20, 0.15)', padding: '10px 14px', borderRadius: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#39ff14' }}>Workout Logged</span>
                      <span style={{ fontSize: '12px', fontWeight: '800', background: 'rgba(57, 255, 20, 0.15)', color: '#39ff14', padding: '3px 8px', borderRadius: '10px' }}>
                        +{workoutDetails.xp} XP
                      </span>
                    </div>

                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                      {workoutDetails.exercises.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', fontStyle: 'italic' }}>
                          No exercises recorded.
                        </div>
                      ) : (
                        workoutDetails.exercises.map((ex, exIdx) => (
                          <div key={exIdx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
                              <Dumbbell size={14} color="var(--accent-cyan)" />
                              {ex.exercise_name}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {Array.isArray(ex.sets) && ex.sets.map((set, sIdx) => (
                                <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 8px', background: 'rgba(255,255,255,0.01)', borderRadius: '6px' }}>
                                  <span>Set {sIdx + 1}</span>
                                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                    {set.weight} kg × {set.reps} reps
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                    Failed to fetch workout details.
                  </div>
                )}
              </div>
            )}

            {/* Content for CYAN - REST */}
            {selectedDay.statusClass === 'active-cyan' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '36px' }}>😴</div>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', margin: 0, lineHeight: '1.5' }}>
                  {friendId 
                    ? `@${profile?.username?.replace('@', '')} has taken the rest day.` 
                    : 'You have taken the rest day.'}
                </p>
              </div>
            )}

            {/* Content for RED - MISSED */}
            {selectedDay.statusClass === 'active-red' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '36px' }}>✗</div>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', margin: 0, lineHeight: '1.5' }}>
                  {friendId 
                    ? `@${profile?.username?.replace('@', '')} did not do a workout.` 
                    : 'You did not do a workout.'}
                </p>
              </div>
            )}

            <button 
              className="btn-primary" 
              onClick={() => setSelectedDay(null)}
              style={{ width: '100%', height: '40px', fontSize: '13px', marginTop: '20px', fontWeight: '700' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
