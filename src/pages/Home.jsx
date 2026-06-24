import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Toast from '../components/Toast';
import PRPopup from '../components/PRPopup';
import { supabase } from '../lib/supabaseClient';

const REST_MESSAGES = [
  "Recovery is part of the grind 🔥",
  "Rest day secured. Come back stronger tomorrow.",
  "Smart athletes recover too 💪",
  "Recovery today. Domination tomorrow 🔥",
  "Recharge mode activated ⚡",
  "Muscles grow during recovery too 🛌",
  "Today's mission: recover stronger 💥",
  "Strategic rest. Smarter progress 💪",
  "Strong bodies are built with rest too ⚡",
  "No guilt. Just recovery 💪",
  "Recovery fuels progression 🔥",
  "A warrior knows when to recover ⚡",
  "Rest today. Level up tomorrow 🔥",
  "Discipline also means proper recovery 💪",
  "The grind continues after recovery 🔥",
  "Smart recovery = better performance ⚡",
];

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const formatDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const [toastInfo, setToastInfo] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [restPopup, setRestPopup] = useState(null);
  const [prQueue, setPrQueue] = useState(null); // array of exercise names that hit PRs
  const [isResting, setIsResting] = useState(false);

  // Animated XP state
  const [displayXp, setDisplayXp] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [noTransition, setNoTransition] = useState(false);
  const [weeklyStatus, setWeeklyStatus] = useState(Array(7).fill(''));
  const prevProfileRef = useRef(null);

  // Shuffle-without-repeat queue
  const restQueueRef = useRef([]);
  // Holds toasts that should only fire AFTER the PR popup closes
  const pendingToastsRef = useRef([]);

  const getNextRestMessage = () => {
    if (restQueueRef.current.length === 0) {
      restQueueRef.current = shuffleArray(REST_MESSAGES);
    }
    return restQueueRef.current.pop();
  };

  const getLevelThreshold = (level) => {
    if (!level) return 100;
    if (level < 10) return 100;
    if (level < 30) return 150;
    if (level < 50) return 200;
    if (level < 70) return 250;
    return 300;
  };

  useEffect(() => {
    if (!profile) return;

    if (!prevProfileRef.current) {
      // First load / returning to home screen: animate from 0 to current XP
      setNoTransition(true);
      setDisplayXp(0);
      setDisplayLevel(profile.level || 1);
      
      setTimeout(() => {
        setNoTransition(false);
        setDisplayXp(profile.xp || 0);
      }, 100);
      
      prevProfileRef.current = profile;
      return;
    }

    const prevProfile = prevProfileRef.current;
    
    // Only trigger level up animation logic if profile actually changed while on screen
    if (profile.xp !== prevProfile.xp || profile.level !== prevProfile.level) {
      if (profile.level > prevProfile.level) {
         // Level up: Animate to full threshold first
         setDisplayXp(getLevelThreshold(prevProfile.level));
         
         setTimeout(() => {
            setNoTransition(true);
            setDisplayXp(0);
            setDisplayLevel(profile.level);
            
            // Allow CSS to apply no-transition and 0% height
            setTimeout(() => {
               setNoTransition(false);
               setDisplayXp(profile.xp);
            }, 50);
         }, 600); // Wait for the fill-to-top animation
         
      } else {
         // Normal XP gain
         setDisplayXp(profile.xp);
      }
      
      prevProfileRef.current = profile;
    }
  }, [profile]);

  const fetchWeeklyStatus = async (userId) => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 1-7 (Mon-Sun)
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    
    const startDateStr = formatDate(monday);
    const todayStr = formatDate(now);

    const { data: logsData } = await supabase
      .from('activity_logs')
      .select('activity_date, activity_type')
      .eq('user_id', userId)
      .gte('activity_date', startDateStr);

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

    // Fetch profile to get account creation date
    const { data: profileData } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .maybeSingle();
      
    const createdDate = profileData?.created_at ? new Date(profileData.created_at) : null;
    // Set createdDate to the beginning of that day for accurate comparison
    if (createdDate) createdDate.setHours(0, 0, 0, 0);
    const createdDateStr = createdDate ? formatDate(createdDate) : null;

    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const iterDate = new Date(monday);
      iterDate.setDate(monday.getDate() + i);
      const dateStr = formatDate(iterDate);

      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      if (logsMap[dateStr] === 'workout') {
        statuses.push('active-green');
      } else if (logsMap[dateStr] === 'rest') {
        statuses.push('active-cyan');
      } else if (isFuture) {
        statuses.push(''); // white
      } else if (isToday) {
        statuses.push('current-gray');
      } else if (createdDateStr && dateStr < createdDateStr) {
        statuses.push('past-inactive'); // light black / inactive
      } else {
        statuses.push('active-red');
      }
    }
    setWeeklyStatus(statuses);
  };

  const handleRestClick = async () => {
    if (isResting) return;
    setIsResting(true);
    try {
      const todayStr = formatDate(new Date());
      const { data, error } = await supabase.rpc('log_rest_day', { p_client_date: todayStr });
      if (error) {
        setToastInfo({ title: "Error", message: error.message });
      } else if (data?.success === false) {
        setToastInfo({ title: "Notice", message: data.error });
      } else {
        // Success
        setRestPopup(getNextRestMessage());
        
        // Optimistically update UI instantly (no lag)
        if (data && data.streak !== undefined) {
          setProfile(prev => prev ? { ...prev, current_streak: data.streak } : null);
        }
        
        // Optimistically set today's status to cyan (rest day)
        const todayDayIndex = (new Date().getDay() || 7) - 1; // 0-6 (Mon-Sun)
        setWeeklyStatus(prev => {
          const next = [...prev];
          next[todayDayIndex] = 'active-cyan';
          return next;
        });

        // Background parallel sync (non-blocking)
        const userId = profile?.id || user?.id;
        if (userId) {
          Promise.all([
            supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle(),
            fetchWeeklyStatus(userId)
          ]).then(([profileRes, _]) => {
            if (profileRes?.data) {
              setProfile(profileRes.data);
            }
          }).catch(err => {
            console.error("Background rest sync error:", err);
          });
        }
      }
    } catch (err) {
      console.error("Rest day error:", err);
    } finally {
      setIsResting(false);
    }
  };

  useEffect(() => {
    const initHome = async () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      } else if (!location.state?.isLogin) {
        navigate('/', { replace: true });
        return;
      }

      const withTimeout = (promise, timeoutMs = 4500) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
        ]);
      };

      // Fetch fresh data from Supabase
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 4500);
        if (session?.user) {
          // Fetch Profile
          const { data, error } = await withTimeout(
            supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle(),
            4500
          );
          
          if (data && !error) {
            setProfile(data);
            // Sync local storage
            localStorage.setItem('user', JSON.stringify({
              ...JSON.parse(localStorage.getItem('user') || '{}'),
              username: data.username,
              gender: data.gender,
              streak: data.current_streak
            }));
          }

          // Fetch Weekly Tracker Data
          await withTimeout(fetchWeeklyStatus(session.user.id), 4500);
        }
      } catch (err) {
        console.error("Home initialization Supabase error or timeout:", err);
      }

      if (location.state?.isLogin) {
        const isNew = location.state.isNew;
        const name = location.state.name;

        if (isNew) {
          setToastInfo({
            title: `Welcome ${name} 💪`,
            message: 'Your fitness journey begins.',
          });
        } else {
          setToastInfo({
            title: `Welcome back ${name} 👋`,
            message: 'Your fitness journey continues...',
          });
        }

        // Clear state using React Router so it doesn't show toast again
        navigate(location.pathname, { replace: true, state: {} });
      } else if (location.state?.workoutFinished) {
        const { xpEarned, levelUp, prsHit, prXp } = location.state;

        // Build the ordered toast sequence (shown AFTER PR popup closes)
        const toastSequence = [];

        if (prsHit && prsHit.length > 0) {
          // PR XP toast comes first (after popup closes)
          if (prXp > 0) {
            toastSequence.push({
              title: `PR Bonus XP 🏆`,
              message: `+${prXp} XP earned for crushing ${prsHit.length} Personal Record${prsHit.length > 1 ? 's' : ''}!`,
              duration: 4000,
            });
          }
          // Workout XP toast comes second
          if (levelUp) {
            toastSequence.push({
              title: `Level Up! 🎉`,
              message: `You reached Level ${levelUp} with ${xpEarned} XP total!`,
              duration: 4000,
            });
          } else {
            toastSequence.push({
              title: `Workout Complete 💪`,
              message: `You Gained ${xpEarned} XP!`,
              duration: 4000,
            });
          }

          // Store them — they will fire sequentially once the PR popup closes
          pendingToastsRef.current = toastSequence;
          setPrQueue(prsHit);
        } else {
          // No PRs — show workout toast immediately as normal
          if (levelUp) {
            setToastInfo({
              title: `Level Up! 🎉`,
              message: `You Gained ${xpEarned} XP and increased to Level ${levelUp}!`,
            });
          } else {
            setToastInfo({
              title: `Workout Complete 💪`,
              message: `You Gained ${xpEarned} XP!`,
            });
          }
        }

        // Clear state using React Router so it doesn't show toast again
        navigate(location.pathname, { replace: true, state: {} });
      } else if (location.state?.checklistCompleted) {
        const { xpEarned, levelUp } = location.state;
        if (levelUp) {
          setToastInfo({
            title: `Level Up! 🎉`,
            message: `You Gained ${xpEarned} XP and increased to Level ${levelUp}!`,
          });
        } else {
          setToastInfo({
            title: `System Tasks Complete! 🎉`,
            message: `You Gained ${xpEarned} XP!`,
          });
        }

        // Clear state using React Router so it doesn't show toast again
        navigate(location.pathname, { replace: true, state: {} });
      }
    };

    initHome();
  }, [location, navigate]);

  if (!user) return null;

  return (
    <div className="container center-content animate-fade-in" style={{ position: 'fixed', top: 0, bottom: 'calc(75px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', overflow: 'hidden', touchAction: 'none' }}>
      {toastInfo && (
        <Toast
          key={toastInfo.title + toastInfo.message}
          title={toastInfo.title}
          message={toastInfo.message}
          duration={toastInfo.duration}
          onDone={toastInfo.onDone}
          onClose={() => setToastInfo(null)}
        />
      )}

      {/* PR Celebration Popup */}
      {prQueue && prQueue.length > 0 && (
        <PRPopup
          username={user?.username}
          prsQueue={prQueue}
          onAllDone={() => {
            setPrQueue(null);
            // Fire the first pending toast, chain the rest
            const queue = [...pendingToastsRef.current];
            pendingToastsRef.current = [];
            if (queue.length === 0) return;

            const showNext = (index) => {
              if (index >= queue.length) return;
              setToastInfo({
                ...queue[index],
                // When this toast closes, show the next one
                onDone: () => showNext(index + 1),
              });
            };
            showNext(0);
          }}
        />
      )}
      {/* Rest Day Popup */}
      {restPopup && (
        <div className="rest-popup-overlay" onClick={() => setRestPopup(null)}>
          <div className="rest-popup" onClick={(e) => e.stopPropagation()}>
            <div className="rest-popup-icon">😴</div>
            <div className="rest-popup-title">Rest Day</div>
            <div className="rest-popup-message">{restPopup}</div>
            <button className="rest-popup-btn" onClick={() => setRestPopup(null)}>
              Got it 👊
            </button>
          </div>
        </div>
      )}

      <div className="avatar-container" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '20px' }}>
        <div className="username" style={{ marginTop: '10px' }}>{user.username}</div>

        <div className="level-xp-section animate-slide-up">
          <div className="level-text">Level {displayLevel}</div>
          <div className="xp-progress-text">XP: {displayXp} / {getLevelThreshold(displayLevel)}</div>
        </div>

        <div className="streak-badge">
          🔥 Streak: {profile?.current_streak || user.streak || 0} days
        </div>

        <div className="weekly-tracker">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <div key={i} className={`day-circle ${weeklyStatus[i] || ''}`}>
              {day}
            </div>
          ))}
        </div>

        <div className="home-action-btns">
          <button
            className="home-btn-start"
            onClick={() => navigate('/exercise')}
          >
            ⚡ Start
          </button>
          <button className="home-btn-rest" onClick={handleRestClick}>
            😴 Rest
          </button>
        </div>
      </div>

      {/* Vertical XP Bar */}
      <div className="xp-bar-container animate-fade-in">
        <div className="xp-bar-outline">
          <div 
            className={`xp-bar-fill ${noTransition ? 'no-transition' : ''}`} 
            style={{ 
              height: `${Math.min(100, (displayXp / getLevelThreshold(displayLevel)) * 100)}%` 
            }} 
          />
        </div>
      </div>

    </div>
  );
}

