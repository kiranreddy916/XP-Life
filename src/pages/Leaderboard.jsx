import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Users, QrCode, Flame, Sparkles, UserPlus, Check, X, Bell, User } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import AddFriendsSheet from '../components/AddFriendsSheet';
import QRCodeModal from '../components/QRCodeModal';

export default function Leaderboard() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [timeframe, setTimeframe] = useState('overall'); // 'weekly' | 'monthly' | 'overall'
  
  // Sheet & Modal controls
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  // Calculate if user has friends
  const hasFriends = leaderboardData.length > 1;

  // Sort leaderboard data dynamically based on the timeframe
  const sortedLeaderboard = [...leaderboardData].sort((a, b) => {
    if (timeframe === 'weekly') {
      return (b.weekly_xp || 0) - (a.weekly_xp || 0);
    } else if (timeframe === 'monthly') {
      return (b.monthly_xp || 0) - (a.monthly_xp || 0);
    } else if (timeframe === 'yearly') {
      return (b.yearly_xp || 0) - (a.yearly_xp || 0);
    } else {
      return (b.total_xp || 0) - (a.total_xp || 0);
    }
  });

  // Get current active XP value for rendering
  const getXPValue = (row) => {
    if (timeframe === 'weekly') return row.weekly_xp || 0;
    if (timeframe === 'monthly') return row.monthly_xp || 0;
    if (timeframe === 'yearly') return row.yearly_xp || 0;
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

      // 2. Fetch pending requests
      const { data: pending, error: pendingErr } = await supabase
        .rpc('get_pending_requests');
        
      if (pendingErr) throw pendingErr;
      setPendingRequests(pending || []);

      // 3. Fetch leaderboard
      const { data: board, error: boardErr } = await supabase
        .rpc('get_leaderboard');
        
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

  if (loading) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh' }}>
        <div style={{ color: 'var(--accent-cyan)', fontSize: '16px' }}>Loading Leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '100px' }}>
      
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
      <div className="leaderboard-header-section">
        <h2 className="leaderboard-title">
          <Trophy size={28} className="title-trophy-icon" />
          Rankings
        </h2>
        
        {/* Buttons Row */}
        <div className="leaderboard-buttons-row">
          <button className="btn-primary add-friends-entry-btn" onClick={() => setIsAddSheetOpen(true)}>
            <span style={{ marginRight: '6px', fontSize: '16px' }}>👥</span> Add Friends
          </button>
          <button className="qr-code-icon-btn" onClick={() => setIsQRModalOpen(true)} title="Show QR Code">
            <QrCode size={22} />
          </button>
        </div>
      </div>

      {/* 1. PENDING REQUESTS PANEL (Only visible if > 0 requests) */}
      {pendingRequests.length > 0 && (
        <div className="pending-invites-section">
          <div className="pending-header">
            <Bell size={16} color="var(--accent-gold)" className="bell-alert" />
            <h3>Pending Invites ({pendingRequests.length})</h3>
          </div>
          <div className="pending-list">
            {pendingRequests.map((req) => (
              <div key={req.friendship_id} className="pending-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {req.profile_image_url ? (
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
                        src={req.profile_image_url} 
                        alt={req.username} 
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
                  <div className="pending-info">
                    <span className="pending-username">@{req.username.replace('@', '')}</span>
                    <span className="pending-subtitle">Lvl {req.level} • {req.total_xp} XP</span>
                  </div>
                </div>
                <div className="pending-actions">
                  <button className="pending-action-btn accept" onClick={() => handleAcceptInvite(req.friendship_id, req.username)} title="Accept Request">
                    <Check size={16} />
                  </button>
                  <button className="pending-action-btn decline" onClick={() => handleDeclineInvite(req.friendship_id)} title="Decline Request">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeframe Selector Tabs (Only if user has friends) */}
      {hasFriends && (
        <div className="leaderboard-timeframe-tabs">
          <button 
            className={`timeframe-tab-btn ${timeframe === 'weekly' ? 'active' : ''}`}
            onClick={() => setTimeframe('weekly')}
          >
            Weekly
          </button>
          <button 
            className={`timeframe-tab-btn ${timeframe === 'monthly' ? 'active' : ''}`}
            onClick={() => setTimeframe('monthly')}
          >
            Monthly
          </button>
          <button 
            className={`timeframe-tab-btn ${timeframe === 'yearly' ? 'active' : ''}`}
            onClick={() => setTimeframe('yearly')}
          >
            Yearly
          </button>
          <button 
            className={`timeframe-tab-btn ${timeframe === 'overall' ? 'active' : ''}`}
            onClick={() => setTimeframe('overall')}
          >
            Overall
          </button>
        </div>
      )}

      {/* 2. RANKINGS TABLE LIST */}
      <div className="rankings-container">
        {leaderboardData.length === 0 ? (
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
                      <span className="ranking-level-pill">Level {row.level}</span>
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
        <>
          <AddFriendsSheet
            isOpen={isAddSheetOpen}
            onClose={() => setIsAddSheetOpen(false)}
            userProfile={userProfile}
            onAddSuccess={fetchData}
          />
          <QRCodeModal
            isOpen={isQRModalOpen}
            onClose={() => setIsQRModalOpen(false)}
            username={userProfile.username}
            friendCode={userProfile.friend_code}
          />
        </>
      )}
    </div>
  );
}
