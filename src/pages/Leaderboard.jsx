import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Users, Flame, Sparkles, UserPlus, Check, X, Bell, User } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import AddFriendsSheet from '../components/AddFriendsSheet';

export default function Leaderboard() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [timeframe, setTimeframe] = useState('weekly'); // 'weekly' | 'monthly' | 'overall'
  
  const [sentRequests, setSentRequests] = useState([]);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  
  // Sheet & Modal controls
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  // Calculate if user has friends
  const hasFriends = leaderboardData.length > 1;

  // Sort leaderboard data dynamically based on the timeframe (current user is prioritized on XP ties)
  const sortedLeaderboard = [...leaderboardData].sort((a, b) => {
    let diff = 0;
    if (timeframe === 'weekly') {
      diff = (b.weekly_xp || 0) - (a.weekly_xp || 0);
    } else if (timeframe === 'monthly') {
      diff = (b.monthly_xp || 0) - (a.monthly_xp || 0);
    } else {
      diff = (b.total_xp || 0) - (a.total_xp || 0);
    }

    if (diff !== 0) return diff;

    // Tie-breaker: current user always comes first
    if (a.is_user) return -1;
    if (b.is_user) return 1;
    return 0;
  });

  // Get current active XP value for rendering
  const getXPValue = (row) => {
    if (timeframe === 'weekly') return row.weekly_xp || 0;
    if (timeframe === 'monthly') return row.monthly_xp || 0;
    return row.total_xp || 0;
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/');
        return;
      }

      const uid = session.user.id;

      // 1. Fetch current user's profile (including friend_code)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
        
      if (profileErr) throw profileErr;
      setUserProfile(profile);

      // 2. Fetch pending requests (received)
      const { data: pending, error: pendingErr } = await supabase
        .rpc('get_pending_requests');
        
      if (pendingErr) throw pendingErr;
      setPendingRequests(pending || []);

      // Fetch pending requests (sent)
      const { data: friendships } = await supabase
        .from('friendships')
        .select('id, friend_id, created_at')
        .eq('user_id', uid)
        .eq('status', 'pending');
        
      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => f.friend_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, gender, level, total_xp, profile_image_url')
          .in('id', friendIds);
          
        if (profiles) {
          const merged = friendships.map(f => {
            const p = profiles.find(profile => profile.id === f.friend_id);
            return {
              friendship_id: f.id,
              receiver_profile_id: f.friend_id,
              username: p?.username || '',
              gender: p?.gender || '',
              level: p?.level || 1,
              total_xp: p?.total_xp || 0,
              profile_image_url: p?.profile_image_url,
              created_at: f.created_at
            };
          });
          setSentRequests(merged);
        } else {
          setSentRequests([]);
        }
      } else {
        setSentRequests([]);
      }

      // 3. Fetch leaderboard
      const now = new Date();
      
      // Start of week (Monday)
      const currentDay = now.getDay();
      const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
      const weekStart = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      
      // Start of month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: board, error: boardErr } = await supabase
        .rpc('get_leaderboard', {
          p_week_start: weekStart.toISOString(),
          p_month_start: monthStart.toISOString()
        });
        
      if (boardErr) throw boardErr;
      setLeaderboardData(board || []);

    } catch (err) {
      console.error('Error fetching leaderboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Check if we opened leaderboard with a trigger to add friends drawer (e.g. from Profile page)
    const localTrigger = localStorage.getItem('trigger_add_friends');
    if (localTrigger) {
      setIsAddSheetOpen(true);
      localStorage.removeItem('trigger_add_friends');
    }
  }, []);

  const handleAcceptInvite = async (friendshipId, senderName) => {
    try {
      const { data, error } = await supabase.rpc('accept_friend_request', {
        p_friendship_id: friendshipId
      });

      if (error) throw error;

      if (data && data.success) {
        triggerToast(`You accepted @${senderName.replace('@', '')}'s request!`);
        fetchData();
      } else {
        triggerToast(data?.error || 'Failed to accept invite.');
      }
    } catch (err) {
      console.error('Error accepting friend:', err);
      triggerToast('Failed to accept invite.');
    }
  };

  const handleDeclineInvite = async (friendshipId) => {
    try {
      const { data, error } = await supabase.rpc('reject_friend_request', {
        p_friendship_id: friendshipId
      });

      if (error) throw error;

      if (data && data.success) {
        triggerToast('Friend request declined.');
        fetchData();
      } else {
        triggerToast(data?.error || 'Failed to decline invite.');
      }
    } catch (err) {
      console.error('Error declining friend:', err);
      triggerToast('Failed to decline invite.');
    }
  };
  const handleUnsendRequest = async (friendshipId) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
        
      if (error) throw error;
      triggerToast('Friend request cancelled.');
      fetchData();
    } catch (err) {
      console.error('Error unsending request:', err);
      triggerToast('Failed to cancel request.');
    }
  };
  if (loading) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh' }}>
        <div style={{ color: 'var(--accent-cyan)', fontSize: '16px' }}>Loading Leaderboard...</div>
      </div>
    );
  }

  const isAndroid = /Android/i.test(navigator.userAgent);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '160px' }}>
      
      {/* Dynamic Toast Message */}
      {showToast && (
        <div className="toast-container animate-slide-up" style={{ zIndex: 1000 }}>
          <div className="toast-content" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
            <Sparkles size={16} color="var(--accent-cyan)" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <div className="leaderboard-header-section" style={isAndroid ? { marginTop: '24px' } : {}}>
        <h2 className="leaderboard-title">
          <Trophy size={28} className="title-trophy-icon" />
          Rankings
        </h2>
        
        {/* Buttons Row */}
        <div className="leaderboard-buttons-row" style={{ gap: '8px' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setIsPendingModalOpen(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '13px', 
              padding: '10px 14px', 
              borderRadius: '12px', 
              border: '1px solid rgba(102, 252, 241, 0.2)', 
              background: 'rgba(102, 252, 241, 0.05)', 
              color: 'var(--accent-cyan)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <Bell size={15} />
            Pending
            {(pendingRequests.length + sentRequests.length) > 0 && (
              <span 
                style={{ 
                  background: 'var(--accent-red)', 
                  color: '#fff', 
                  fontSize: '10px', 
                  fontWeight: '700',
                  padding: '1px 6px', 
                  borderRadius: '10px', 
                  marginLeft: '2px' 
                }}
              >
                {pendingRequests.length + sentRequests.length}
              </span>
            )}
          </button>
          <button className="btn-primary add-friends-entry-btn" onClick={() => setIsAddSheetOpen(true)}>
            <span style={{ marginRight: '6px', fontSize: '16px' }}>👥</span> Add Friends
          </button>
        </div>
      </div>

      {/* Timeframe Selector Tabs (Only if user has friends) */}
      {hasFriends && (
        <div className="leaderboard-timeframe-tabs">
          <button 
            className={`timeframe-tab-btn ${timeframe === 'weekly' ? 'active' : ''}`}
            onClick={() => setTimeframe('weekly')}
          >
            WEEK
          </button>
          <button 
            className={`timeframe-tab-btn ${timeframe === 'monthly' ? 'active' : ''}`}
            onClick={() => setTimeframe('monthly')}
          >
            MONTH
          </button>
          <button 
            className={`timeframe-tab-btn ${timeframe === 'overall' ? 'active' : ''}`}
            onClick={() => setTimeframe('overall')}
          >
            TOTAL
          </button>
        </div>
      )}

      {/* 2. RANKINGS TABLE LIST */}
      <div className="rankings-container">
        {!hasFriends ? (
          <div className="empty-leaderboard-card">
            <Users size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <h4>No Rankings Available</h4>
            <p>Add friends using their unique codes to start competing!</p>
          </div>
        ) : (
          <div className="rankings-list">
            {(hasFriends ? sortedLeaderboard : leaderboardData).map((row, index) => {
              const rank = index + 1;
              let rankBadge = null;
              let rowClass = 'ranking-row';

              if (row.is_user) {
                rowClass += ' is-current-user';
              }

              if (rank === 1) {
                rowClass += ' rank-gold';
                rankBadge = <span className="rank-medal gold">👑</span>;
              } else if (rank === 2) {
                rowClass += ' rank-silver';
                rankBadge = <span className="rank-medal silver">🥈</span>;
              } else if (rank === 3) {
                rowClass += ' rank-bronze';
                rankBadge = <span className="rank-medal bronze">🥉</span>;
              } else {
                rankBadge = <span className="rank-number">{rank}</span>;
              }

              const displayXp = hasFriends ? getXPValue(row) : row.total_xp;

              return (
                <div key={row.profile_id} className={rowClass}>
                  {/* Left Column: Rank Medallion */}
                  <div className="ranking-rank-col">
                    {rankBadge}
                  </div>

                  {/* Center Column: Avatar + Profile */}
                  <div className="ranking-profile-col">
                    {row.profile_image_url ? (
                      <div 
                        style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '50%', 
                          overflow: 'hidden', 
                          border: '1.5px solid var(--accent-cyan)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--panel-bg)'
                        }}
                      >
                        <img 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                          src={row.profile_image_url} 
                          alt={row.username} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ) : (
                      <div 
                        style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '50%', 
                          backgroundColor: 'rgba(255,255,255,0.05)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        <User size={18} color="var(--text-secondary)" />
                      </div>
                    )}
                    <div className="ranking-user-details">
                      <span className="ranking-username">
                        @{row.username.replace('@', '')}
                        {row.is_user && <span className="current-user-tag">YOU</span>}
                      </span>
                    </div>
                  </div>

                  {/* Right Columns: total XP */}
                  <div className="ranking-metrics-col">
                    <div className="ranking-xp-value">
                      <span>{displayXp.toLocaleString()} XP</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sheet & Modal overlays */}
      {userProfile && (
        <AddFriendsSheet
          isOpen={isAddSheetOpen}
          onClose={() => setIsAddSheetOpen(false)}
          userProfile={userProfile}
          onAddSuccess={fetchData}
        />
      )}

      {/* Pending Requests Modal Popup */}
      {isPendingModalOpen && (
        <div className="cl-modal-overlay" onClick={() => setIsPendingModalOpen(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%', maxHeight: '80vh', overflowY: 'auto', padding: '24px', background: 'var(--panel-bg)', borderRadius: '24px', border: '1px solid var(--glass-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>Friend Requests</h2>
              <button className="close-modal" onClick={() => setIsPendingModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            
            {/* Section 1: Received Requests */}
            <div className="pending-section" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: '12px', letterSpacing: '0.05em', fontWeight: '700' }}>Received ({pendingRequests.length})</h3>
              {pendingRequests.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No received requests.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {pendingRequests.map(req => (
                    <div key={req.friendship_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {req.profile_image_url ? (
                          <img draggable="false" onContextMenu={(e) => e.preventDefault()} src={req.profile_image_url} alt={req.username} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={16} color="var(--text-secondary)" />
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>@{req.username.replace('@', '')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{req.total_xp} XP</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="pending-action-btn accept" onClick={() => handleAcceptInvite(req.friendship_id, req.username)} style={{ padding: '6px', borderRadius: '8px', background: 'rgba(102, 252, 241, 0.1)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={14} />
                        </button>
                        <button className="pending-action-btn decline" onClick={() => handleDeclineInvite(req.friendship_id)} style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255, 75, 75, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Sent Requests */}
            <div className="pending-section">
              <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: '12px', letterSpacing: '0.05em', fontWeight: '700' }}>Sent ({sentRequests.length})</h3>
              {sentRequests.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No pending sent requests.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {sentRequests.map(req => (
                    <div key={req.friendship_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {req.profile_image_url ? (
                          <img draggable="false" onContextMenu={(e) => e.preventDefault()} src={req.profile_image_url} alt={req.username} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={16} color="var(--text-secondary)" />
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>@{req.username.replace('@', '')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{req.total_xp} XP</span>
                        </div>
                      </div>
                      <button onClick={() => handleUnsendRequest(req.friendship_id)} style={{ fontSize: '11px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600' }}>
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
