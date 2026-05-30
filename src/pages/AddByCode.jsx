import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, UserPlus, ShieldAlert, CheckCircle, Trophy, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function AddByCode() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading', 'unauthorized', 'success', 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [usernameMatched, setUsernameMatched] = useState('');

  useEffect(() => {
    const processFriendRequest = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // 1. Not Authenticated: Save code and redirect to Login
        if (!session?.user) {
          localStorage.setItem('pending_friend_code', code);
          setStatus('unauthorized');
          return;
        }

        // 2. Authenticated: Fetch target username to show who they are adding
        const { data: targetUser, error: queryErr } = await supabase
          .from('profiles')
          .select('username')
          .eq('friend_code', code.toUpperCase())
          .maybeSingle();

        if (queryErr) throw queryErr;
        
        if (!targetUser) {
          setStatus('error');
          setErrorMessage('This friend code is invalid or has expired.');
          return;
        }

        setUsernameMatched(targetUser.username);

        // Send friend request
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('send_friend_request', {
          p_friend_code: code.toUpperCase()
        });

        if (rpcErr) throw rpcErr;

        if (rpcRes && rpcRes.success) {
          setStatus('success');
          setSuccessMessage(rpcRes.message);
          
          // Auto redirect to Leaderboard after 3.5 seconds
          const timer = setTimeout(() => {
            navigate('/leaderboard');
          }, 3500);
          return () => clearTimeout(timer);
        } else {
          setStatus('error');
          setErrorMessage(rpcRes?.error || 'Failed to add friend.');
        }
      } catch (err) {
        console.error('Error adding friend via code:', err);
        setStatus('error');
        setErrorMessage('A network error occurred. Please try again.');
      }
    };

    if (code) {
      processFriendRequest();
    } else {
      setStatus('error');
      setErrorMessage('No friend code provided.');
    }
  }, [code, navigate]);

  // Handle CTA redirect for unauthorized users
  const handleProceedToLogin = () => {
    navigate('/');
  };

  return (
    <div className="container center-content" style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, rgba(102,252,241,0.06) 0%, #0b0c10 70%)' }}>
      
      {/* 1. LOADING SCREEN */}
      {status === 'loading' && (
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ borderTopColor: 'var(--accent-cyan)' }}></div>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Connecting friend request...</p>
        </div>
      )}

      {/* 2. SUCCESS SCREEN */}
      {status === 'success' && (
        <div className="glass-panel animate-scale-up" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(102,252,241,0.1)', marginBottom: '20px' }}>
            <CheckCircle size={48} color="var(--accent-cyan)" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#fff' }}>Friend Connected!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
            {successMessage || `You successfully connected with @${usernameMatched.replace('@', '')}`}
          </p>
          <div className="settings-instruction-card" style={{ marginBottom: '20px', background: 'rgba(102,252,241,0.03)' }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-cyan)' }}>
              Redirecting you to the Leaderboard in a few seconds...
            </p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/leaderboard')} style={{ width: '100%' }}>
            Go to Leaderboard
          </button>
        </div>
      )}

      {/* 3. ERROR SCREEN */}
      {status === 'error' && (
        <div className="glass-panel animate-scale-up" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(255, 75, 75, 0.1)', marginBottom: '20px' }}>
            <ShieldAlert size={48} color="#ff4b4b" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#fff' }}>Connection Failed</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
            {errorMessage}
          </p>
          <button className="btn-secondary" onClick={() => navigate('/leaderboard')} style={{ width: '100%' }}>
            Back to Leaderboard
          </button>
        </div>
      )}

      {/* 4. UNAUTHORIZED (GUEST SCANNER) SCREEN */}
      {status === 'unauthorized' && (
        <div className="glass-panel animate-scale-up" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(255,191,0,0.1)', marginBottom: '20px' }}>
            <Trophy size={48} color="var(--accent-gold)" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#fff' }}>Welcome to FitQuest</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
            You've scanned an invite! Create an account or sign in now to add them as a friend and track streaks together.
          </p>
          
          <button className="btn-primary" onClick={handleProceedToLogin} style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
            <LogIn size={18} />
            <span>Login / Join FitQuest</span>
          </button>
          
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Code scanned: <strong style={{ color: 'var(--accent-cyan)' }}>{code}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
