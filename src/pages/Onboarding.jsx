import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Onboarding() {
  const location = useLocation();
  const navigate = useNavigate();

  const gmailName = location.state?.name || '';
  const userId = location.state?.userId || null;

  const [formData, setFormData] = useState({
    name: gmailName,
    username: '',
    gender: '',
    height: '',
    weight: ''
  });
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

  // Check if all required fields are filled
  const isFormValid =
    formData.username.trim() !== '' &&
    formData.gender !== '' &&
    formData.height !== '' &&
    formData.weight !== '';

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

    const localUser = {
      id: userId,
      name: formData.name,
      username: `@${formData.username.trim()}`,
      gender: formData.gender,
      streak: 0
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
        style={{ width: '100%', maxWidth: '400px' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
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

        {/* Error message */}
        {error && (
          <p style={{ color: '#ff4b4b', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* CTA — disabled until all fields are filled */}
        <button
          className="btn-primary"
          onClick={handleStart}
          disabled={!isFormValid || loading}
          style={{
            marginTop: '12px',
            opacity: (!isFormValid || loading) ? 0.4 : 1,
            cursor: (!isFormValid || loading) ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.3s ease'
          }}
        >
          {loading ? 'Saving...' : "Let's Start"}
        </button>
      </div>
    </div>
  );
}
