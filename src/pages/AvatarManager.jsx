import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Plus, Sparkles, RefreshCw, Check, X, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { avatarService } from '../lib/avatar/avatarService';
import AvatarViewer from '../components/AvatarViewer';
import Toast from '../components/Toast';

export default function AvatarManager() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const provider = avatarService.getActiveProvider();
  const iframeRef = useRef(null);

  // 1. Fetch user authentication state & Supabase profile
  useEffect(() => {
    const fetchUserAndProfile = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.user) {
          navigate('/', { replace: true });
          return;
        }

        const uid = session.user.id;
        setUserId(uid);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (profileError) throw profileError;

        if (profileData) {
          setProfile(profileData);
          setSavedAvatarUrl(profileData.avatar_url);
        }
      } catch (err) {
        console.error("Error loading user profile in AvatarManager:", err);
        setError("Failed to load user profile. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndProfile();
  }, [navigate]);

  // 2. Setup message listener for Ready Player Me iframe events
  useEffect(() => {
    if (!showEditor) return;

    const handleIframeMessage = (event) => {
      const avatarData = provider.parseEditorMessage(event);
      if (avatarData) {
        // We got a successful avatar export!
        setPendingAvatarUrl(avatarData.avatarUrl);
        setShowEditor(false);
        setToast({
          title: "Avatar Created! ✨",
          message: "Rotate the avatar below and click 'Save Changes' to apply it."
        });
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
    };
  }, [showEditor, provider]);

  // 3. Handle Saving the Avatar GLB URL to Supabase
  const handleSaveAvatar = async () => {
    if (!pendingAvatarUrl) return;

    setSaving(true);
    setError(null);

    const success = await avatarService.saveUserAvatar(userId, {
      provider: provider.getId(),
      avatarUrl: pendingAvatarUrl
    });

    setSaving(false);
    if (success) {
      setSavedAvatarUrl(pendingAvatarUrl);
      setPendingAvatarUrl(null);
      setToast({
        title: "Success! 🎉",
        message: "Your 3D Avatar has been successfully saved."
      });
      // Redirect home after brief delay
      setTimeout(() => {
        navigate('/home');
      }, 1500);
    } else {
      setError("Failed to save avatar to database. Please try again.");
    }
  };

  const handleEditClick = () => {
    setShowEditor(true);
  };

  const handleDiscardChanges = () => {
    setPendingAvatarUrl(null);
    setToast({
      title: "Discarded ⚡",
      message: "Pending avatar modifications were discarded."
    });
  };

  const activeAvatarToShow = pendingAvatarUrl || savedAvatarUrl;

  if (loading) {
    return (
      <div className="container center-content" style={{ minHeight: '100vh' }}>
        <div style={{ color: 'var(--accent-cyan)', fontSize: '16px' }}>Loading 3D Engine...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '100px', paddingTop: '20px' }}>
      
      {toast && (
        <Toast
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', padding: '0 20px' }}>
        <button 
          onClick={() => navigate('/home')}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>Avatar Customizer</h2>
      </div>

      {/* Main Container */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        
        {/* Error Boundary */}
        {error && (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              background: 'rgba(255, 75, 75, 0.1)', 
              border: '1px solid rgba(255, 75, 75, 0.3)', 
              borderRadius: '16px',
              padding: '16px',
              color: '#ff4b4b',
              width: '100%',
              maxWidth: '360px',
              fontSize: '14px'
            }}
          >
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* 3D Canvas Box */}
        <div 
          style={{
            width: '100%',
            maxWidth: '360px',
            height: '420px',
            borderRadius: '24px',
            overflow: 'hidden',
            border: pendingAvatarUrl ? '2px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
            background: 'radial-gradient(circle, rgba(102,252,241,0.05) 0%, rgba(11,12,16,0.5) 100%)',
            position: 'relative',
            boxShadow: pendingAvatarUrl ? '0 0 25px rgba(102, 252, 241, 0.25)' : '0 8px 32px rgba(0,0,0,0.4)'
          }}
        >
          {activeAvatarToShow ? (
            <AvatarViewer avatarUrl={activeAvatarToShow} height="100%" />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Sparkles size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>No 3D Avatar Yet</div>
              <div style={{ fontSize: '13px', textAlign: 'center', padding: '0 32px' }}>Create your custom 3D avatar from head-to-toe with Ready Player Me!</div>
            </div>
          )}

          {/* Pending Changes Badge */}
          {pendingAvatarUrl && (
            <div 
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'var(--accent-cyan)',
                color: '#0b0c10',
                fontSize: '11px',
                fontWeight: '800',
                padding: '4px 10px',
                borderRadius: '50px',
                boxShadow: '0 2px 10px rgba(102,252,241,0.4)'
              }}
            >
              PENDING CHANGES
            </div>
          )}
        </div>

        {/* Control Actions Panel */}
        <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* If there are pending unsaved changes */}
          {pendingAvatarUrl ? (
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button 
                className="btn-secondary" 
                onClick={handleDiscardChanges}
                disabled={saving}
                style={{ flex: 1, borderColor: 'rgba(255,75,75,0.3)', color: '#ff4b4b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <X size={18} />
                Discard
              </button>
              <button 
                className="btn-primary" 
                onClick={handleSaveAvatar}
                disabled={saving}
                style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Check size={18} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            // Normal buttons flow
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              {savedAvatarUrl ? (
                <>
                  <button 
                    className="btn-primary" 
                    onClick={handleEditClick}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Edit2 size={18} />
                    Edit Avatar Outfit
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={handleEditClick}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <RefreshCw size={18} />
                    Recreate Custom Avatar
                  </button>
                </>
              ) : (
                <button 
                  className="btn-primary" 
                  onClick={handleEditClick}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Plus size={18} />
                  Create 3D Avatar
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Full-Screen Ready Player Me Iframe Creator Modal */}
      {showEditor && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#0b0c10',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header toolbar for RPM frame */}
          <div 
            style={{ 
              height: '60px', 
              background: '#111', 
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <span style={{ fontWeight: '700', color: 'white' }}>FitQuest Avatar Creator</span>
            </div>
            <button 
              onClick={() => setShowEditor(false)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '50px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: '600',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>

          {/* Iframe Viewport */}
          <iframe 
            ref={iframeRef}
            src={provider.getEditorUrl({ avatarId: savedAvatarUrl ? savedAvatarUrl.split('/').pop()?.replace('.glb', '') : null })} 
            style={{ 
              flex: 1, 
              border: 'none', 
              width: '100%', 
              height: '100%' 
            }}
            allow="camera; microphone; clipboard-write"
            title="Ready Player Me Avatar Customizer"
          />
        </div>
      )}

    </div>
  );
}
