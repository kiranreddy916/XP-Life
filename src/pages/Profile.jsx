import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Flame, Zap, Trophy, Star, Plus, ChevronRight, X, UserPen, LogOut, Trash2, Lock, Copy, Check } from 'lucide-react';
import Avatar from '../components/Avatar';
import AvatarEditor from '../components/AvatarEditor';
import { supabase } from '../lib/supabaseClient';

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [joinedDate, setJoinedDate] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [recentBadges, setRecentBadges] = useState([]);
  
  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [editForm, setEditForm] = useState({
    username: '',
    gender: '',
    height: '',
    weight: '',
    avatar_config: {}
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchProfileData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.user) {
          if (isMounted) navigate('/', { replace: true });
          return;
        }

        const user = session.user;
        const date = new Date(user.created_at);
        if (isMounted) setJoinedDate(date.getFullYear().toString());

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) throw error;

        if (data && isMounted) {
          setProfile(data);
        } else if (!data && isMounted) {
          navigate('/onboarding', { state: { userId: user.id, name: user.user_metadata?.full_name || user.email }, replace: true });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        if (isMounted) navigate('/', { replace: true });
      }
    };

    fetchProfileData();
    return () => { isMounted = false; };
  }, [navigate]);

  // Fetch last 4 months of badges
  useEffect(() => {
    const fetchBadges = async () => {
      const { data, error } = await supabase.rpc('get_user_badges');
      if (!error && data) {
        // data is already DESC by year/month — take first 4, then reverse to show oldest→newest
        let recent = data.slice(0, 4).reverse();
        
        // Ensure exactly 4 slots by padding with future locked months
        while (recent.length > 0 && recent.length < 4) {
          const last = recent[recent.length - 1];
          let nextMonth = last.month + 1;
          let nextYear = last.year;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
          }
          recent.push({
            year: nextYear,
            month: nextMonth,
            status: 'locked',
            image_url: null
          });
        }
        
        setRecentBadges(recent);
      }
    };
    fetchBadges();
  }, []);

  // Fetch friends for streaks
  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const { data, error } = await supabase.rpc('get_friends');
        if (!error && data) {
          setFriendsList(data);
        }
      } catch (err) {
        console.error("Error fetching friends for streaks:", err);
      }
    };
    fetchFriends();
  }, []);

  const handleSignout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('user');
    navigate('/', { replace: true });
  };

  const handleEditClick = () => {
    setEditForm({
      username: profile.username,
      gender: profile.gender || '',
      height: profile.height || '',
      weight: profile.weight || '',
      avatar_config: profile.avatar_config || {}
    });
    setShowSettings(false);
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        username: editForm.username,
        gender: editForm.gender,
        height: editForm.height ? Number(editForm.height) : null,
        weight: editForm.weight ? Number(editForm.weight) : null,
        avatar_config: editForm.avatar_config
      })
      .eq('id', profile.id);

    setSaving(false);
    if (!error) {
      setProfile({ ...profile, ...editForm });
      
      // Update local storage so home page sees new avatar/username immediately
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...localUser,
        username: `@${editForm.username}`,
        gender: editForm.gender,
        avatar_config: editForm.avatar_config
      }));

      setIsEditing(false);
    } else {
      console.error("Error updating profile:", error);
      alert("Failed to save profile.");
    }
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete your account? This action cannot be undone.");
    if (!confirmDelete) return;

    // Delete profile row first
    await supabase.from('profiles').delete().eq('id', profile.id);
    
    // Call custom RPC to delete user from auth.users
    await supabase.rpc('delete_user');
    
    // Sign out
    await handleSignout();
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(profile.friend_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleAddFriendClick = () => {
    localStorage.setItem('trigger_add_friends', 'true');
    navigate('/leaderboard');
  };

  if (!profile) return (
    <div className="container center-content" style={{ minHeight: '100vh' }}>
      <div style={{ color: 'var(--accent-cyan)', fontSize: '16px' }}>Loading Profile...</div>
    </div>
  );

  // === EDIT PROFILE VIEW ===
  if (isEditing) {
    return (
      <div className="container center-content animate-fade-in" style={{ paddingBottom: '100px', paddingTop: '40px' }}>
        <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '24px', margin: 0 }}>Edit Profile</h2>
            <button className="close-modal" onClick={() => setIsEditing(false)}>
              <X size={24} />
            </button>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <AvatarEditor 
              config={editForm.avatar_config} 
              onChange={(newConfig) => setEditForm({ ...editForm, avatar_config: newConfig })} 
            />
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              className="input-field"
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Gender</label>
            <select
              className="input-field themed-select"
              value={editForm.gender}
              onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
            >
              <option value="" disabled>Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Height (cm)</label>
            <input
              type="number"
              className="input-field"
              value={editForm.height}
              onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Weight (kg)</label>
            <input
              type="number"
              className="input-field"
              value={editForm.weight}
              onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
            />
          </div>

          <button 
            className="btn-primary" 
            onClick={handleSaveProfile}
            disabled={saving}
            style={{ marginTop: '10px' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          <div style={{ marginTop: '40px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '30px' }}>
            <button 
              className="btn-secondary" 
              onClick={handleDeleteAccount}
              style={{ color: '#ff4b4b', borderColor: 'rgba(255, 75, 75, 0.3)', display: 'flex', gap: '8px', justifyContent: 'center' }}
            >
              <Trash2 size={20} />
              Delete Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === DEFAULT PROFILE VIEW ===
  return (
    <div className="animate-fade-in" style={{ paddingBottom: '100px' }}>
      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="close-modal" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            
            <button className="settings-option" onClick={handleEditClick}>
              <UserPen size={20} className="settings-option-icon" />
              Edit Profile
            </button>
            
            <button className="settings-option danger" onClick={handleSignout}>
              <LogOut size={20} className="settings-option-icon" />
              Signout
            </button>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="profile-header">
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          <Settings size={24} />
        </button>
        <h2 className="profile-username">{profile.username}</h2>
        <Avatar gender={profile.gender || 'male'} config={profile.avatar_config} />
        <div className="profile-joined">@ {profile.username.replace('@', '')} • Joined {joinedDate}</div>
        
        {/* Unique Friend Code display */}
        <div className="profile-friend-code-badge" onClick={handleCopyCode} title="Click to copy friend code">
          <span>CODE: <strong>{profile.friend_code}</strong></span>
          {copiedCode ? <Check size={13} color="var(--accent-cyan)" /> : <Copy size={13} />}
        </div>
      </div>

      {/* Overview Section */}
      <div className="profile-section">
        <div className="section-header">
          <h3>Overview</h3>
        </div>
        <div className="stats-grid">
          <div className="stat-card streak">
            <Flame className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">{profile.current_streak || 0}</span>
              <span className="stat-label">Day streak</span>
            </div>
          </div>
          <div className="stat-card xp">
            <Zap className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">{profile.total_xp || 0}</span>
              <span className="stat-label">Total XP</span>
            </div>
          </div>
          <div className="stat-card league">
            <Trophy className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">Amethyst</span>
              <span className="stat-label">Current League</span>
            </div>
          </div>
          <div className="stat-card finishes">
            <Star className="stat-icon" />
            <div className="stat-info">
              <span className="stat-value">0</span>
              <span className="stat-label">Top finishes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Friend Streaks Section */}
      <div className="profile-section">
        <div className="section-header">
          <h3>Friend Streaks</h3>
        </div>
        <div className="horizontal-list">
          {/* Display real friends streaks */}
          {friendsList.map(friend => (
            <div key={friend.friend_profile_id} className="friend-item">
              <div className="friend-circle" style={{ position: 'relative' }}>
                <Avatar gender={friend.gender || 'male'} config={friend.avatar_config} />
              </div>
              <span className="friend-streak" style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                <Flame size={12} className="streak-fire-icon" />
                {friend.current_streak || 0}
              </span>
              <span className="friend-name-label">
                @{friend.username.replace('@', '')}
              </span>
            </div>
          ))}
          
          {/* Add Friends Trigger Item */}
          <div className="friend-item" onClick={handleAddFriendClick} style={{ cursor: 'pointer' }}>
            <div className="friend-circle friend-add">
              <Plus size={24} />
            </div>
            <span className="friend-streak">Add</span>
          </div>
        </div>
      </div>

      {/* Post Masculine Challenge Section */}
      <div className="profile-section">
        <div className="section-header">
          <h3>Post Masculine Challenge</h3>
          <span
            className="section-chevron"
            onClick={() => navigate('/badges')}
            title="View all badges"
          >
            <ChevronRight size={20} />
          </span>
        </div>
        <div className="horizontal-list">
          {recentBadges.length === 0
            ? [1,2,3,4].map(i => (
                <div key={i} className="badge-item">
                  <div className="badge-circle badge-circle-locked">
                    <Lock size={28} className="badge-lock-icon" />
                  </div>
                  <span className="badge-month-label badge-label-locked">—</span>
                </div>
              ))
            : recentBadges.map((badge, idx) => (
                <div key={`${badge.year}-${badge.month}-${idx}`} className="badge-item">
                  <div className={`badge-circle ${badge.status === 'achieved' ? 'badge-circle-achieved' : badge.status === 'missed' ? 'badge-circle-missed' : 'badge-circle-locked'}`}>
                    {badge.status === 'locked'
                      ? <Lock size={28} className="badge-lock-icon" />
                      : <img src={badge.image_url} alt={badge.month} className="badge-img" style={{ filter: badge.status === 'missed' ? 'grayscale(100%) blur(2px) opacity(60%)' : 'none' }} />}
                  </div>
                  <span className={`badge-month-label ${badge.status === 'achieved' ? 'badge-label-achieved' : badge.status === 'missed' ? 'badge-label-missed' : 'badge-label-locked'}`}>
                    {new Date(badge.year, badge.month - 1).toLocaleString('default', { month: 'short' }).toUpperCase()}
                  </span>
                </div>
              ))
          }
        </div>
      </div>

      {/* Achievements Section */}
      <div className="profile-section">
        <div className="section-header">
          <h3>Achievements</h3>
          <span
            className="section-chevron"
            onClick={() => navigate('/prs')}
            title="View Personal Records"
          >
            <ChevronRight size={20} />
          </span>
        </div>
        <div className="horizontal-list">
           {[10, 50, 100, 200].map((val) => (
             <div key={val} className="achievement-item">
               <div className="achievement-icon-wrapper">
                 <Star size={48} color="var(--accent-gold)" />
                 <span className="achievement-badge-pill">{val}</span>
               </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
