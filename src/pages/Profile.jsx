import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Flame, Zap, Trophy, Star, Plus, ChevronRight, X, UserPen, LogOut, Trash2, Lock, Copy, Check, Camera, Image, Video, User } from 'lucide-react';
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
  const [activeFriendStreaks, setActiveFriendStreaks] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [friendsStreakStatuses, setFriendsStreakStatuses] = useState([]);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [loadingStreaks, setLoadingStreaks] = useState(true);
  const [personalRecords, setPersonalRecords] = useState([]);
  const [editForm, setEditForm] = useState({
    username: '',
    gender: '',
    height: '',
    weight: '',
    profile_image_url: null
  });
  const [saving, setSaving] = useState(false);

  // In-app Camera state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle file upload to Supabase Storage
  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      setSaving(true);
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${profile.id}/profile_${Date.now()}.${fileExt}`;

      // Upload file to the bucket
      const { data, error: uploadErr } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadErr) throw uploadErr;

      // Retrieve public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      setEditForm(prev => ({ ...prev, profile_image_url: publicUrl }));
    } catch (err) {
      console.error("Error uploading profile picture:", err);
      alert("Failed to upload image: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      setCameraStream(stream);
      // Wait briefly for elements to mount and reference is updated
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error("Camera access failed:", err);
      setCameraError("Camera access denied. Please allow camera permissions in your settings.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !cameraStream) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror horizontally for selfie style
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_${Date.now()}.png`, { type: 'image/png' });
        handleFileUpload(file);
        stopCamera();
        setShowCameraModal(false);
      }
    }, 'image/png');
  };

  // Close camera if modal is closed
  useEffect(() => {
    if (!showCameraModal) {
      stopCamera();
    }
    return () => stopCamera();
  }, [showCameraModal]);

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

  const getLocalDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const fetchStreakData = async () => {
    try {
      setLoadingStreaks(true);
      const clientDate = getLocalDateStr();
      // Sync streaks on load
      await supabase.rpc('sync_my_friend_streaks', { p_client_date: clientDate });

      // Fetch active streaks
      const { data: activeStreaks, error: activeErr } = await supabase.rpc('get_active_friend_streaks');
      if (activeErr) throw activeErr;
      setActiveFriendStreaks(activeStreaks || []);

      // Fetch streak statuses of friends (for new streak invite)
      const { data: statuses, error: statusesErr } = await supabase.rpc('get_friends_streak_statuses');
      if (statusesErr) throw statusesErr;
      setFriendsStreakStatuses(statuses || []);

      // Fetch incoming invites
      const { data: invites, error: invitesErr } = await supabase.rpc('get_streak_invites');
      if (invitesErr) throw invitesErr;
      setIncomingInvites(invites || []);

    } catch (err) {
      console.error("Error fetching streak data:", err);
    } finally {
      setLoadingStreaks(false);
    }
  };

  useEffect(() => {
    fetchStreakData();
  }, []);

  const handleSendInvite = async (receiverId) => {
    const { data, error } = await supabase.rpc('send_streak_invite', { p_receiver_id: receiverId });
    if (error) {
      alert("Failed to send invite: " + error.message);
    } else if (data?.success === false) {
      alert(data.error);
    } else {
      fetchStreakData();
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    const { data, error } = await supabase.rpc('accept_streak_invite', { p_invite_id: inviteId });
    if (error) {
      alert("Failed to accept invite: " + error.message);
    } else if (data?.success === false) {
      alert(data.error);
    } else {
      fetchStreakData();
    }
  };

  const handleRejectInvite = async (inviteId) => {
    const { data, error } = await supabase.rpc('reject_streak_invite', { p_invite_id: inviteId });
    if (error) {
      alert("Failed to reject invite: " + error.message);
    } else if (data?.success === false) {
      alert(data.error);
    } else {
      fetchStreakData();
    }
  };

  // Fetch top 3 PRs for profile preview
  useEffect(() => {
    const fetchPRs = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data, error } = await supabase
          .from('exercise_prs')
          .select('exercise_name, best_weight, best_reps, best_volume, achieved_at')
          .eq('user_id', session.user.id)
          .order('best_volume', { ascending: false })
          .limit(3);
        if (!error && data) {
          setPersonalRecords(data);
        }
      } catch (err) {
        console.error("Error fetching PRs for profile preview:", err);
      }
    };
    fetchPRs();
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
      profile_image_url: profile.profile_image_url || null
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
        profile_image_url: editForm.profile_image_url
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
        profile_image_url: editForm.profile_image_url
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

          {/* Profile Picture Uploader controls */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: 'var(--panel-bg)', borderRadius: '24px', padding: '24px', border: '1px solid var(--glass-border)', marginBottom: '16px' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent-cyan)' }}>
              {editForm.profile_image_url ? (
                <img 
                  draggable="false"
                  onContextMenu={(e) => e.preventDefault()}
                  src={editForm.profile_image_url} 
                  alt="Preview" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <User size={50} color="var(--text-secondary)" />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
              <button 
                type="button"
                className="btn-secondary" 
                onClick={() => {
                  setShowCameraModal(true);
                  startCamera();
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', padding: '10px' }}
              >
                <Camera size={16} />
                Camera
              </button>
              <button 
                type="button"
                className="btn-primary" 
                onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', padding: '10px' }}
              >
                <Image size={16} />
                Gallery
              </button>
              {editForm.profile_image_url && (
                <button 
                  type="button"
                  onClick={() => setEditForm({ ...editForm, profile_image_url: null })}
                  style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', padding: '10px', background: 'rgba(255, 75, 75, 0.1)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: '12px', marginTop: '4px', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                  Remove Picture
                </button>
              )}
            </div>

            {/* Hidden native input for Gallery Upload */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              style={{ display: 'none' }}
            />
          </div>

          {/* Camera Viewfinder Overlay Modal */}
          {showCameraModal && (
            <div 
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                background: 'rgba(11, 12, 16, 0.95)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '24px'
              }}
            >
              <div 
                style={{
                  width: '100%',
                  maxWidth: '380px',
                  background: 'var(--panel-bg)',
                  borderRadius: '24px',
                  border: '1px solid var(--glass-border)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '20px'
                }}
              >
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Camera Viewfinder</h3>
                  <button 
                    onClick={() => {
                      stopCamera();
                      setShowCameraModal(false);
                    }}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {cameraError ? (
                  <div style={{ color: '#ff4b4b', textAlign: 'center', fontSize: '14px', padding: '20px 0' }}>
                    {cameraError}
                  </div>
                ) : (
                  <div 
                    style={{ 
                      width: '100%', 
                      aspectRatio: '1', 
                      borderRadius: '16px', 
                      overflow: 'hidden', 
                      background: 'black', 
                      position: 'relative',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <video 
                      ref={videoRef}
                      autoPlay 
                      playsInline 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        transform: 'scaleX(-1)' // selfie mirroring
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <button 
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      stopCamera();
                      setShowCameraModal(false);
                    }}
                    style={{ flex: 1 }}
                  >
                    Close
                  </button>
                  {!cameraError && (
                    <button 
                      type="button"
                      className="btn-primary"
                      onClick={capturePhoto}
                      style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <Video size={18} />
                      Capture Photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

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
    <div className="animate-fade-in" style={{ paddingBottom: '160px' }}>
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
        
        {/* Render uploaded profile photo if exists, else fallback User icon */}
        {profile.profile_image_url ? (
          <div 
            style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 4px 15px rgba(102, 252, 241, 0.2)',
              margin: '0 auto 8px auto'
            }}
          >
            <img 
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
              src={profile.profile_image_url} 
              alt={profile.username} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div 
            style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              border: '2px solid var(--accent-cyan)',
              boxShadow: '0 4px 15px rgba(102, 252, 241, 0.2)',
              margin: '0 auto 8px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.05)'
            }}
          >
            <User size={50} color="var(--text-secondary)" />
          </div>
        )}

        <h2 className="profile-username" style={{ fontSize: '20px', fontWeight: '800', marginTop: '4px', marginBottom: '2px', color: '#fff' }}>
          @{profile.username.replace('@', '')}
        </h2>
        <div className="profile-joined" style={{ marginTop: '2px', marginBottom: '8px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Joined {joinedDate}
        </div>
        
        {/* Unique Friend Code display */}
        <div className="profile-friend-code-badge" onClick={handleCopyCode} title="Click to copy friend code" style={{ marginTop: '4px' }}>
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
          <button 
            onClick={() => setShowStreakModal(true)} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--accent-cyan)', 
              fontSize: '13px', 
              fontWeight: 600, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(102, 252, 241, 0.05)'}
            onMouseLeave={(e) => e.target.style.background = 'none'}
          >
            <span>Streak Invites</span>
            {incomingInvites.length > 0 && (
              <span style={{ background: 'var(--accent-red)', width: '8px', height: '8px', borderRadius: '50%' }} />
            )}
          </button>
        </div>
        <div className="horizontal-list">
          {activeFriendStreaks.map(streak => (
            <div key={streak.streak_id} className="friend-item">
              <div 
                className="friend-circle" 
                style={{ 
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                {streak.profile_image_url ? (
                  <img 
                    draggable="false"
                    onContextMenu={(e) => e.preventDefault()}
                    src={streak.profile_image_url} 
                    alt={streak.username} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <User size={24} color="var(--text-secondary)" />
                )}
              </div>
              <span className="friend-streak" style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                <Flame size={12} className="streak-fire-icon" />
                {streak.current_streak || 0}
              </span>
              <span className="friend-name-label">
                @{streak.username.replace('@', '')}
              </span>
            </div>
          ))}
          
          {/* Empty Add Friends Trigger Items to maintain 5-circle representation */}
          {Array.from({ length: Math.max(1, 5 - activeFriendStreaks.length) }).map((_, idx) => (
            <div key={`add-${idx}`} className="friend-item" onClick={() => setShowStreakModal(true)} style={{ cursor: 'pointer' }}>
              <div className="friend-circle friend-add" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Plus size={24} />
              </div>
              <span className="friend-streak">Add</span>
            </div>
          ))}
        </div>
      </div>

      {/* Streak Invites Modal Overlay */}
      {showStreakModal && (
        <div className="modal-overlay" onClick={() => setShowStreakModal(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="modal-header" style={{ marginBottom: '8px' }}>
              <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '800' }}>Streak Invites</h2>
              <button className="close-modal" onClick={() => setShowStreakModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px' }}>
              {/* Incoming invites section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', margin: 0, fontWeight: '700' }}>
                  Received Invites
                </h4>
                {incomingInvites.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '4px 0' }}>No pending streak invites.</div>
                ) : (
                  incomingInvites.map(invite => (
                    <div key={invite.invite_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                          {invite.profile_image_url ? (
                            <img src={invite.profile_image_url} alt={invite.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={16} color="var(--text-secondary)" />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>@{invite.username.replace('@', '')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="btn-primary" 
                          onClick={() => handleAcceptInvite(invite.invite_id)}
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', height: 'auto', cursor: 'pointer' }}
                        >
                          Accept
                        </button>
                        <button 
                          className="btn-secondary" 
                          onClick={() => handleRejectInvite(invite.invite_id)}
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', height: 'auto', color: 'var(--accent-red)', borderColor: 'rgba(255,75,75,0.2)', cursor: 'pointer' }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: 0 }} />

              {/* Friends list to invite */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', margin: 0, fontWeight: '700' }}>
                  Start a New Streak
                </h4>
                {friendsStreakStatuses.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '4px 0' }}>No friends available to start a streak.</div>
                ) : (
                  friendsStreakStatuses.map(friend => (
                    <div key={friend.friend_profile_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                          {friend.profile_image_url ? (
                            <img src={friend.profile_image_url} alt={friend.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={16} color="var(--text-secondary)" />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>@{friend.username.replace('@', '')}</span>
                      </div>
                      <div>
                        {friend.invite_status === 'pending_sent' && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Pending</span>
                        )}
                        {friend.invite_status === 'pending_received' && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn-primary" 
                              onClick={() => handleAcceptInvite(friend.invite_id)}
                              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', height: 'auto', cursor: 'pointer' }}
                            >
                              Accept
                            </button>
                          </div>
                        )}
                        {friend.invite_status === 'none' && (
                          <button 
                            className="btn-secondary" 
                            onClick={() => handleSendInvite(friend.friend_profile_id)}
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', height: 'auto', border: '1px solid rgba(102, 252, 241, 0.2)', color: 'var(--accent-cyan)', background: 'rgba(102, 252, 241, 0.02)', cursor: 'pointer' }}
                          >
                            Send Invite
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                      : <img draggable="false" onContextMenu={(e) => e.preventDefault()} src={badge.image_url} alt={badge.month} className="badge-img" style={{ filter: badge.status === 'missed' ? 'grayscale(100%) blur(2px) opacity(60%)' : 'none' }} />}
                  </div>
                  <span className={`badge-month-label ${badge.status === 'achieved' ? 'badge-label-achieved' : badge.status === 'missed' ? 'badge-label-missed' : 'badge-label-locked'}`}>
                    {new Date(badge.year, badge.month - 1).toLocaleString('default', { month: 'short' }).toUpperCase()}
                  </span>
                </div>
              ))
          }
        </div>
      </div>

      {/* Personal Record Section */}
      <div className="profile-section">
        <div className="section-header">
          <h3>Personal Record</h3>
          <span
            className="section-chevron"
            onClick={() => navigate('/prs')}
            title="View Personal Records"
          >
            <ChevronRight size={20} />
          </span>
        </div>
        {personalRecords.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', padding: '12px 0', fontSize: '13px', textAlign: 'center', width: '100%' }}>
            No records logged yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {personalRecords.map((pr) => (
              <div key={pr.exercise_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontWeight: 600, color: '#fff', fontSize: '13px' }}>{pr.exercise_name}</span>
                <span style={{ color: 'var(--accent-cyan)', fontSize: '13px', fontWeight: 700 }}>
                  {pr.best_weight} kg × {pr.best_reps} reps
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
