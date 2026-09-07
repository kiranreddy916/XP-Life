import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { AVATAR_OPTIONS, DEFAULT_AVATAR } from '../constants/avatars';

export default function Onboarding() {
  const location = useLocation();
  const navigate = useNavigate();

  const gmailName = location.state?.name || '';
  const userId = location.state?.userId || null;

  const [step, setStep] = useState(1); // 1: Info Form, 2: Avatar Selection
  const [formData, setFormData] = useState({
    name: gmailName,
    username: '',
    gender: '',
    height: '',
    weight: ''
  });
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATAR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Safety: if no userId, redirect to login
  useEffect(() => {
    if (!userId) {
      navigate('/');
    }
  }, [userId, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Check if all required info fields are filled
  const isFormValid =
    formData.username.trim() !== '' &&
    formData.gender !== '' &&
    formData.height !== '' &&
    formData.weight !== '';

  const handleNextStep = (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    setError('');
    setStep(2);
  };

  const handleStart = async () => {
    if (!isFormValid) return;

    setLoading(true);
    setError('');

    const { error: dbError } = await supabase.rpc('create_profile', {
      p_user_id: userId,
      p_username: formData.username.trim(),
      p_gender: formData.gender,
      p_height: formData.height ? Number(formData.height) : null,
      p_weight: formData.weight ? Number(formData.weight) : null
    });

    if (dbError) {
      console.error('Profile creation error:', dbError);
      setError('Failed to save profile. Please try again.');
      setLoading(false);
      return;
    }

    // Save the name value and selected home_avatar to profiles table
    await supabase.from('profiles').update({ 
      name: formData.name,
      home_avatar: selectedAvatar 
    }).eq('id', userId);

    const localUser = {
      id: userId,
      name: formData.name,
      username: `@${formData.username.trim()}`,
      gender: formData.gender,
      streak: 0,
      home_avatar: selectedAvatar
    };
    localStorage.setItem('user', JSON.stringify(localUser));

    navigate('/home', {
      state: { isLogin: true, isNew: true, name: formData.name },
      replace: true
    });
  };

  return (
    <div
      className="container center-content"
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(102,252,241,0.08) 0%, #0b0c10 70%)'
      }}
    >
      <div
        className="glass-panel animate-slide-up"
        style={{ width: '100%', maxWidth: '420px' }}
      >
        {/* Step Indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: 'var(--accent-cyan)' }} />
          <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: step === 2 ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />
        </div>

        {step === 1 ? (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1
                style={{
                  fontSize: '26px',
                  fontWeight: '800',
                  marginBottom: '6px',
                  background: 'linear-gradient(135deg, #ffffff, #66fcf1)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                Welcome to FitQuest
              </h1>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>💪</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
                Set up your profile
              </p>
            </div>

            {/* Full Name — pre-filled from Gmail, read-only */}
            <div className="form-group">
              <input
                type="text"
                className="input-field"
                name="name"
                value={formData.name}
                readOnly
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                placeholder="Name"
              />
            </div>

            {/* Username */}
            <div className="form-group">
              <input
                type="text"
                className="input-field"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Username"
                autoComplete="off"
              />
            </div>

            {/* Gender — styled dropdown */}
            <div className="form-group">
              <select
                className="input-field themed-select"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="" disabled>Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Height */}
            <div className="form-group">
              <input
                type="number"
                className="input-field"
                name="height"
                value={formData.height}
                onChange={handleChange}
                placeholder="Height (cm)"
                min="50"
                max="300"
              />
            </div>

            {/* Weight */}
            <div className="form-group">
              <input
                type="number"
                className="input-field"
                name="weight"
                value={formData.weight}
                onChange={handleChange}
                placeholder="Weight (kg)"
                min="20"
                max="500"
              />
            </div>

            {/* CTA — Continue to Avatar selection */}
            <button
              className="btn-primary"
              onClick={handleNextStep}
              disabled={!isFormValid}
              style={{
                marginTop: '16px',
                opacity: !isFormValid ? 0.4 : 1,
                cursor: !isFormValid ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.3s ease'
              }}
            >
              Continue &rarr;
            </button>
          </>
        ) : (
          <>
            {/* Step 2: Avatar Selection */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1
                style={{
                  fontSize: '24px',
                  fontWeight: '800',
                  marginBottom: '6px',
                  background: 'linear-gradient(135deg, #ffffff, #66fcf1)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                Choose Your Avatar
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Select a character avatar for your Home section
              </p>
            </div>

            {/* Avatar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {AVATAR_OPTIONS.map((avatar) => {
                const isSelected = selectedAvatar === avatar.url;
                return (
                  <div
                    key={avatar.id}
                    onClick={() => setSelectedAvatar(avatar.url)}
                    style={{
                      position: 'relative',
                      background: isSelected ? 'rgba(102, 252, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      padding: '16px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 0 20px rgba(102, 252, 241, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      transform: isSelected ? 'scale(1.03)' : 'scale(1)'
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'var(--accent-cyan)',
                          color: '#0b0c10',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: '800'
                        }}
                      >
                        ✓
                      </div>
                    )}
                    <img
                      src={avatar.url}
                      alt={avatar.name}
                      draggable="false"
                      onContextMenu={(e) => e.preventDefault()}
                      style={{
                        width: '100px',
                        height: '100px',
                        objectFit: 'contain',
                        marginBottom: '8px',
                        filter: isSelected ? 'drop-shadow(0 0 10px rgba(102, 252, 241, 0.4))' : 'none'
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                      {avatar.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Error message */}
            {error && (
              <p style={{ color: '#ff4b4b', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
                {error}
              </p>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(1)}
                disabled={loading}
                style={{ flex: 1, height: '46px', fontSize: '14px', fontWeight: '600' }}
              >
                &larr; Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleStart}
                disabled={loading}
                style={{ flex: 2, height: '46px', fontSize: '14px', fontWeight: '700' }}
              >
                {loading ? 'Saving...' : "Let's Start"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
