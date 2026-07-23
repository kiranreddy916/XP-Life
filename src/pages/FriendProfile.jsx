import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Flame, Zap, Trophy, Star, Dumbbell, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function FriendProfile() {
  const { id: friendId } = useParams();
  const navigate = useNavigate();
  
  const [currentUser, setCurrentUser] = useState(null);
  const [friendProfile, setFriendProfile] = useState(null);
  const [friendStreakWithUser, setFriendStreakWithUser] = useState(0);
  const [friendBadges, setFriendBadges] = useState([]);
  const [friendPRs, setFriendPRs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Chart Data
  const [friendWeeklyXP, setFriendWeeklyXP] = useState(Array(7).fill(0));
  const [userWeeklyXP, setUserWeeklyXP] = useState(Array(7).fill(0));
  const [weekLabels, setWeekLabels] = useState(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  
  // Modals & Bottom Sheets
  const [showUnfriendSheet, setShowUnfriendSheet] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [processingUnfriend, setProcessingUnfriend] = useState(false);

  // Lock body scroll when sheets/modals are open
  useEffect(() => {
    if (showUnfriendSheet || showConfirmDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showUnfriendSheet, showConfirmDialog]);

  // Helper to format date into YYYY-MM-DD local string
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  // Get the 7 dates of the current week (Monday to Sunday)
  const getWeekDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // Mon=1, Sun=7
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      dates.push(day);
    }
    return dates;
  };

  // Fetch all profile details, badges, and records
  const fetchAllFriendData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/', { replace: true });
        return;
      }
      setCurrentUser(session.user);

      // 1. Fetch friend profile
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', friendId)
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profile) {
        alert("Friend profile not found.");
        navigate(-1);
        return;
      }
      setFriendProfile(profile);

      // 2. Fetch current friend streak with logged-in user
      const { data: activeStreaks } = await supabase
        .from('friend_streaks')
        .select('current_streak')
        .eq('streak_status', 'active')
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${session.user.id})`)
        .maybeSingle();

      setFriendStreakWithUser(activeStreaks?.current_streak || 0);

      // 3. Fetch friend's monthly badges
      const { data: badges, error: badgesErr } = await supabase.rpc('get_friend_badges', { p_user_id: friendId });
      if (!badgesErr && badges) {
        setFriendBadges(badges);
      }

      // 4. Fetch friend's personal records (limit 3)
      const { data: prs, error: prsErr } = await supabase
        .from('exercise_prs')
        .select('exercise_name, best_weight, best_reps, best_volume, achieved_at')
        .eq('user_id', friendId)
        .order('best_volume', { ascending: false })
        .limit(3);
      if (!prsErr && prs) {
        setFriendPRs(prs);
      }

      // 5. Fetch XP progress data for current week
      const weekDates = getWeekDates();
      
      // Update X-axis weekday labels dynamically (Mon=M, Tue=T, etc.)
      const labels = weekDates.map(d => d.toLocaleDateString('en-US', { weekday: 'short' })[0]);
      setWeekLabels(labels);

      const startDateStr = getLocalDateStr(weekDates[0]);
      const endDateStr = getLocalDateStr(weekDates[6]);

      // Fetch friend's activity logs for this week
      const { data: friendLogs } = await supabase
        .from('activity_logs')
        .select('activity_date, xp_earned')
        .eq('user_id', friendId)
        .gte('activity_date', startDateStr)
        .lte('activity_date', endDateStr);

      // Fetch user's activity logs for this week
      const { data: userLogs } = await supabase
        .from('activity_logs')
        .select('activity_date, xp_earned')
        .eq('user_id', session.user.id)
        .gte('activity_date', startDateStr)
        .lte('activity_date', endDateStr);

      // Map logs to daily arrays
      const friendXP = Array(7).fill(0);
      const userXP = Array(7).fill(0);

      weekDates.forEach((date, index) => {
        const dateStr = getLocalDateStr(date);
        
        // Sum XP for friend on this day
        if (friendLogs) {
          const dayLogs = friendLogs.filter(log => log.activity_date === dateStr);
          friendXP[index] = dayLogs.reduce((sum, log) => sum + (log.xp_earned || 0), 0);
        }

        // Sum XP for current user on this day
        if (userLogs) {
          const dayLogs = userLogs.filter(log => log.activity_date === dateStr);
          userXP[index] = dayLogs.reduce((sum, log) => sum + (log.xp_earned || 0), 0);
        }
      });

      setFriendWeeklyXP(friendXP);
      setUserWeeklyXP(userXP);

    } catch (err) {
      console.error("Error loading friend profile details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllFriendData();

    if (!friendId) return;

    // Realtime subscriptions
    const profileSub = supabase
      .channel(`friend-profile-${friendId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${friendId}` }, () => {
        fetchAllFriendData();
      })
      .subscribe();

    const activitySub = supabase
      .channel(`friend-activity-${friendId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        fetchAllFriendData();
      })
      .subscribe();

    const friendshipSub = supabase
      .channel(`friendship-status-${friendId}`)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friendships' }, () => {
        // If unfriend happens, navigate back
        navigate(-1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profileSub);
      supabase.removeChannel(activitySub);
      supabase.removeChannel(friendshipSub);
    };
  }, [friendId]);

  // Unfriend trigger
  const handleUnfriendConfirm = async () => {
    try {
      setProcessingUnfriend(true);
      const { data, error } = await supabase.rpc('unfriend_user', { p_friend_id: friendId });
      
      if (error) throw error;
      
      if (data?.success) {
        setShowConfirmDialog(false);
        setShowUnfriendSheet(false);
        navigate(-1);
      } else {
        alert(data?.error || "Failed to remove friend.");
      }
    } catch (err) {
      console.error("Error removing friend:", err);
      alert("Error removing friend: " + err.message);
    } finally {
      setProcessingUnfriend(false);
    }
  };

  if (loading || !friendProfile) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
        <div>Loading Friend Profile...</div>
      </div>
    );
  }

  // Parse Joined Year
  const joinedYear = friendProfile.created_at ? new Date(friendProfile.created_at).getFullYear() : 2026;

  // Calculate achievements dynamically
  const getAchievements = () => {
    const list = [];
    const joinedDateStr = friendProfile.created_at ? new Date(friendProfile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently';

    if (friendProfile.total_xp >= 100) {
      list.push({
        id: 'early_starter',
        title: 'Early Starter',
        description: 'Earned first 100 XP',
        icon: <Zap size={24} color="var(--accent-cyan)" />,
        date: joinedDateStr
      });
    }
    if (friendProfile.level >= 5) {
      list.push({
        id: 'dedicated',
        title: 'Dedicated Athlete',
        description: 'Reached Level 5',
        icon: <Trophy size={24} color="var(--accent-cyan)" />,
        date: 'Recently'
      });
    }
    if (friendProfile.longest_streak >= 7) {
      list.push({
        id: 'streak_master',
        title: 'Streak Master',
        description: 'Completed a 7-day streak',
        icon: <Flame size={24} color="var(--accent-cyan)" />,
        date: 'Recently'
      });
    }
    if (friendPRs.length > 0) {
      const prAchievedDate = friendPRs[0].achieved_at ? new Date(friendPRs[0].achieved_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently';
      list.push({
        id: 'powerlifter',
        title: 'Powerlifter',
        description: 'Achieved first Personal Record',
        icon: <Dumbbell size={24} color="var(--accent-cyan)" />,
        date: prAchievedDate
      });
    }
    if (friendProfile.total_xp >= 1000) {
      list.push({
        id: 'centurion',
        title: 'Centurion',
        description: 'Accumulated 1,000 XP',
        icon: <Star size={24} color="var(--accent-cyan)" />,
        date: 'Recently'
      });
    }
    return list;
  };

  const unlockedAchievements = getAchievements();

  // Filter badges achieved in the current calendar month
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();
  const currentMonthBadges = friendBadges.filter(b => b.month === currentMonthNum && b.year === currentYearNum && b.status === 'achieved');

  // SVG Chart variables
  const chartWidth = 500;
  const chartHeight = 150;
  const chartPadding = 20;
  
  // Calculate max XP in weekly data for scaling (minimum max of 100)
  const maxWeeklyXP = Math.max(...friendWeeklyXP, ...userWeeklyXP, 100);

  // Generate SVG Points for lines
  const getSvgPoints = (xpArray) => {
    return xpArray.map((xp, index) => {
      const x = chartPadding + (index * (chartWidth - chartPadding * 2)) / 6;
      const y = chartHeight - chartPadding - (xp / maxWeeklyXP) * (chartHeight - chartPadding * 2);
      return { x, y };
    });
  };

  const friendPoints = getSvgPoints(friendWeeklyXP);
  const userPoints = getSvgPoints(userWeeklyXP);

  const getPointsPathStr = (points) => {
    if (points.length === 0) return '';
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  };

  const getAreaPathStr = (points) => {
    if (points.length === 0) return '';
    const linePath = getPointsPathStr(points);
    return `${linePath} L ${points[points.length - 1].x} ${chartHeight - chartPadding} L ${points[0].x} ${chartHeight - chartPadding} Z`;
  };

  const friendPathStr = getPointsPathStr(friendPoints);
  const friendAreaStr = getAreaPathStr(friendPoints);

  const userPathStr = getPointsPathStr(userPoints);
  const userAreaStr = getAreaPathStr(userPoints);

  // Weekly aggregates
  const friendWeekTotal = friendWeeklyXP.reduce((s, x) => s + x, 0);
  const userWeekTotal = userWeeklyXP.reduce((s, x) => s + x, 0);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px', background: 'var(--bg-color)', minHeight: '100vh', position: 'relative' }}>
      
      {/* Profile Header */}
      <div className="profile-header" style={{ textAlign: 'center', paddingTop: '16px', paddingBottom: '16px', position: 'relative' }}>
        
        {/* Back Button */}
        <button 
          className="badges-back-btn" 
          onClick={() => navigate(-1)} 
          style={{ 
            position: 'absolute', 
            top: '16px', 
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

        {/* Profile Picture */}
        {friendProfile.profile_image_url ? (
          <div 
            style={{ 
              width: '110px', 
              height: '110px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 4px 15px rgba(102, 252, 241, 0.2)',
              margin: '8px auto 12px auto'
            }}
          >
            <img 
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
              src={friendProfile.profile_image_url} 
              alt={friendProfile.username} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div 
            style={{ 
              width: '110px', 
              height: '110px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 4px 15px rgba(102, 252, 241, 0.2)',
              margin: '8px auto 12px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.05)'
            }}
          >
            <User size={50} color="var(--text-secondary)" />
          </div>
        )}

        {/* Current Level Badge */}
        <div style={{ display: 'inline-block', background: 'rgba(102, 252, 241, 0.1)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan-dim)', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Level {friendProfile.level || 1}
        </div>

        {/* Display Name */}
        <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', margin: '2px 0 2px 0' }}>
          {friendProfile.name || friendProfile.username.replace('@', '')}
        </h2>

        {/* Username and Joined date */}
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          @{friendProfile.username.replace('@', '')} • Joined {joinedYear}
        </div>
      </div>

      {/* Friends Actions Button */}
      <div style={{ padding: '0 20px', marginTop: '16px' }}>
        <button 
          className="btn-primary" 
          onClick={() => setShowUnfriendSheet(true)}
          style={{ width: '100%', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', height: '48px', fontSize: '14px', cursor: 'pointer' }}
        >
          FRIENDS
        </button>
      </div>

      {/* Weekly Progress Section */}
      <div className="profile-section" style={{ marginTop: '16px' }}>
        <div className="section-header">
          <h3>Weekly Progress</h3>
        </div>
        
        {/* SVG Line Graph */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="auto" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="friendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.15)" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="rgba(255,255,255,0.15)" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.5, 1].map((scale, i) => {
              const yVal = chartPadding + scale * (chartHeight - chartPadding * 2);
              return (
                <line 
                  key={i} 
                  x1={chartPadding} 
                  y1={yVal} 
                  x2={chartWidth - chartPadding} 
                  y2={yVal} 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeWidth="1" 
                  strokeDasharray="4 4" 
                />
              );
            })}

            {/* User area & line (background comparison) */}
            {userPoints.length > 0 && (
              <>
                <path d={userAreaStr} fill="url(#userGrad)" />
                <path d={userPathStr} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="3 3" />
                {userPoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r="3" fill="rgba(255,255,255,0.3)" />
                ))}
              </>
            )}

            {/* Friend area & line */}
            {friendPoints.length > 0 && (
              <>
                <path d={friendAreaStr} fill="url(#friendGrad)" />
                <path d={friendPathStr} fill="none" stroke="var(--accent-cyan)" strokeWidth="3" />
                {friendPoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r="5" fill="var(--bg-color)" stroke="var(--accent-cyan)" strokeWidth="2" />
                ))}
              </>
            )}
          </svg>

          {/* X-axis Day Labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px 0 12px' }}>
            {weekLabels.map((lbl, idx) => (
              <span key={idx} style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', width: '20px', textAlign: 'center' }}>
                {lbl}
              </span>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }} />
              <span style={{ fontWeight: 600, color: '#fff' }}>{friendProfile.name || friendProfile.username.replace('@', '')}</span>
            </div>
            <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{friendWeekTotal} XP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>You</span>
            </div>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{userWeekTotal} XP</span>
          </div>
        </div>
      </div>

      {/* Friends Overview Section */}
      <div className="profile-section" style={{ marginTop: '16px' }}>
        <div className="section-header">
          <h3>Friends Overview</h3>
        </div>
        <div className="stats-grid">
          <div className="stat-card xp">
            <Zap className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">{friendProfile.total_xp || 0}</span>
              <span className="stat-label">Total XP</span>
            </div>
          </div>
          <div className="stat-card streak">
            <Flame className="stat-icon" style={{ color: 'var(--accent-cyan)' }} />
            <div className="stat-info">
              <span className="stat-value">{friendStreakWithUser}</span>
              <span className="stat-label">Friend Streak</span>
            </div>
          </div>
          <div className="stat-card streak">
            <Flame className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">{friendProfile.current_streak || 0}</span>
              <span className="stat-label">Current Streak</span>
            </div>
          </div>
          <div className="stat-card league">
            <Trophy className="stat-icon" style={{ color: 'var(--accent-gold)' }} />
            <div className="stat-info">
              <span className="stat-value">{friendProfile.longest_streak || 0}</span>
              <span className="stat-label">Longest Streak</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Badges Section */}
      <div className="profile-section" style={{ marginTop: '16px' }}>
        <div className="section-header">
          <h3>Monthly Badges</h3>
        </div>
        {currentMonthBadges.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', padding: '12px 0', fontSize: '13px', textAlign: 'center', width: '100%' }}>
            No badges earned this month.
          </div>
        ) : (
          <div className="horizontal-list">
            {currentMonthBadges.map((badge, idx) => (
              <div key={`${badge.year}-${badge.month}-${idx}`} className="badge-item">
                <div className="badge-circle badge-circle-achieved">
                  <img 
                    draggable="false" 
                    onContextMenu={(e) => e.preventDefault()} 
                    src={badge.image_url} 
                    alt="badge" 
                    className="badge-img" 
                  />
                </div>
                <span className="badge-month-label badge-label-achieved">
                  {new Date(badge.year, badge.month - 1).toLocaleString('default', { month: 'short' }).toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Achievements Section */}
      <div className="profile-section" style={{ marginTop: '16px' }}>
        <div className="section-header">
          <h3>Achievements</h3>
        </div>
        {unlockedAchievements.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', padding: '12px 0', fontSize: '13px', textAlign: 'center', width: '100%' }}>
            No achievements unlocked yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {unlockedAchievements.map(ach => (
              <div 
                key={ach.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '14px', 
                  padding: '12px 16px', 
                  background: 'rgba(255,255,255,0.02)', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.05)' 
                }}
              >
                <div 
                  style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '12px', 
                    background: 'rgba(102, 252, 241, 0.05)', 
                    border: '1px solid rgba(102, 252, 241, 0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}
                >
                  {ach.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: 0 }}>{ach.title}</h4>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>{ach.date}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0', lineHeight: '1.4' }}>
                    {ach.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends Actions Sheet Overlay */}
      {showUnfriendSheet && (
        <div className="modal-overlay" onClick={() => setShowUnfriendSheet(false)} style={{ zIndex: 999 }}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px', borderRadius: '24px 24px 0 0', position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', animation: 'slideUp 0.3s ease-out' }}>
            <div className="modal-header" style={{ marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', margin: 0, fontWeight: '800' }}>Manage Friend</h2>
              <button className="close-modal" onClick={() => setShowUnfriendSheet(false)}>
                <X size={20} />
              </button>
            </div>
            <button 
              className="settings-option danger" 
              onClick={() => setShowConfirmDialog(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', padding: '16px', borderRadius: '12px', width: '100%', background: 'rgba(255, 75, 75, 0.05)', color: 'var(--accent-red)', border: '1px solid rgba(255, 75, 75, 0.1)', cursor: 'pointer' }}
            >
              Unfriend
            </button>
            <button 
              className="settings-option" 
              onClick={() => setShowUnfriendSheet(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', padding: '16px', borderRadius: '12px', width: '100%', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', marginTop: '8px', cursor: 'pointer', justifyContent: 'center' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unfriend Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal-overlay" onClick={() => !processingUnfriend && setShowConfirmDialog(false)} style={{ zIndex: 1000 }}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '340px', textAlign: 'center', padding: '24px', borderRadius: '24px', margin: 'auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0 0 10px 0' }}>Unfriend Friend?</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              Are you sure you want to remove this friend? This will completely delete friendships and streaks on both sides.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-secondary" 
                disabled={processingUnfriend}
                onClick={() => setShowConfirmDialog(false)}
                style={{ flex: 1, height: '40px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                disabled={processingUnfriend}
                onClick={handleUnfriendConfirm}
                style={{ flex: 1, height: '40px', fontSize: '13px', background: 'var(--accent-red)', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                {processingUnfriend ? 'Removing...' : 'Unfriend'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
