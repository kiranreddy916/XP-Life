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
  const [selectedModelUrl, setSelectedModelUrl] = useState(null);
  
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

  // 2. Setup message listener for Ready Player Me iframe events (only for RPM provider)
  useEffect(() => {
    if (!showEditor || provider.getId() !== 'readyplayerme') return;

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
    const models = provider.getId() === 'default' ? provider.getModels() : [];
    const initialUrl = activeAvatarToShow || (models.length > 0 ? models[0].url : null);
    setSelectedModelUrl(initialUrl);
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

      {/* Full-Screen Native Character Selector Modal */}
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
          {/* Header toolbar */}
          <div 
            style={{ 
              height: '60px', 
              background: '#111', 
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <span style={{ fontWeight: '700', color: 'white' }}>FitQuest Avatar Selector</span>
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

          {/* Interactive Preview & Selection Grid */}
          <div 
            style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden' 
            }}
          >
            {/* 3D Preview Area */}
            <div 
              style={{
                height: '260px',
                width: '100%',
                background: 'radial-gradient(circle, rgba(102,252,241,0.05) 0%, rgba(11,12,16,0.5) 100%)',
                position: 'relative',
                borderBottom: '1px solid var(--glass-border)',
                flexShrink: 0
              }}
            >
              {selectedModelUrl ? (
                <AvatarViewer avatarUrl={selectedModelUrl} height="100%" />
              ) : (
                <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  No Model Selected
                </div>
              )}
            </div>

            {/* List / Grid of Available Chassis */}
            <div 
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px' 
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: '0 0 4px 0', color: 'white' }}>Choose Your Chassis</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Select an optimized high-performance 3D body representation.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(provider.getId() === 'default' ? provider.getModels() : []).map((model) => {
                  const isSelected = selectedModelUrl === model.url;
                  return (
                    <div
                      key={model.id}
                      onClick={() => setSelectedModelUrl(model.url)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '16px',
                        background: isSelected ? 'rgba(102, 252, 241, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? '2.5px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 0 12px rgba(102, 252, 241, 0.12)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '800', color: isSelected ? 'var(--accent-cyan)' : 'white', fontSize: '14px' }}>
                          {model.name}
                        </span>
                        {isSelected && (
                          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b0c10' }}>
                            <Check size={11} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        {model.description}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Confirm Action Button */}
              <button
                className="btn-primary"
                onClick={() => {
                  if (selectedModelUrl) {
                    setPendingAvatarUrl(selectedModelUrl);
                    setShowEditor(false);
                    setToast({
                      title: "Chassis Selected! ✨",
                      message: "Rotate the avatar below and click 'Save Changes' to apply it."
                    });
                  }
                }}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '50px'
                }}
              >
                <Check size={18} />
                Select Character
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
