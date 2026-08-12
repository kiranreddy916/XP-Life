import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Flame, Trophy, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function WorkoutTracker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const friendId = searchParams.get('friendId');

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState({});
  const [targetUserId, setTargetUserId] = useState(null);

  // Helper to format date in YYYY-MM-DD local format
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const todayStr = getLocalDateStr();

  useEffect(() => {
    const initTracker = async () => {
      try {
        setLoading(true);
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

        // Fetch activity logs from April 1, 2026 to August 31, 2026
        const { data: logsData, error: logsErr } = await supabase
          .from('activity_logs')
          .select('activity_date, activity_type')
          .eq('user_id', uid)
          .gte('activity_date', '2026-04-01')
          .lte('activity_date', '2026-08-31');

        if (logsErr) throw logsErr;

        // Map logs to a date key map for instant lookups
        const logsMap = {};
        if (logsData) {
          logsData.forEach(log => {
            // If both rest and workout exist on a day, prioritize workout
            if (log.activity_type === 'workout') {
              logsMap[log.activity_date] = 'workout';
            } else if (log.activity_type === 'rest' && logsMap[log.activity_date] !== 'workout') {
              logsMap[log.activity_date] = 'rest';
            }
          });
        }
        setLogs(logsMap);

      } catch (err) {
        console.error("Failed to load workout tracker data:", err);
      } finally {
        setLoading(false);
      }
    };

    initTracker();
  }, [friendId, navigate]);

  if (loading) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--accent-cyan)' }}>
        <div style={{ fontSize: '16px' }}>Loading Workout Tracker...</div>
      </div>
    );
  }

  // Account creation date for graying out before account was made
  const accountCreatedDateStr = profile?.created_at ? getLocalDateStr(new Date(profile.created_at)) : null;

  // Calendar months to display (August 2026 down to April 2026)
  const monthsToRender = [
    { year: 2026, month: 7, name: 'August 2026' },  // Month index 7 is August
    { year: 2026, month: 6, name: 'July 2026' },
    { year: 2026, month: 5, name: 'June 2026' },
    { year: 2026, month: 4, name: 'May 2026' },
    { year: 2026, month: 3, name: 'April 2026' }
  ];

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
              <div className="day-circle past-inactive" style={{ width: '24px', height: '24px', fontSize: '10px' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Pre-Account</span>
            </div>
          </div>
        </div>

        {/* Render Months */}
        {monthsToRender.map(({ year, month, name }) => {
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
            <div className="glass-panel" key={name} style={{ padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              {/* Month Header */}
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                {name}
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
                      // Check if it's before account creation
                      if (accountCreatedDateStr && dateStr < accountCreatedDateStr) {
                        statusClass = 'past-inactive';
                      } else {
                        statusClass = 'active-red'; // Missed day
                      }
                    }
                  }

                  return (
                    <div 
                      key={`day-${dayNum}`}
                      className={`day-circle ${statusClass}`}
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
                        color: statusClass ? undefined : 'var(--text-secondary)'
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
    </div>
  );
}
