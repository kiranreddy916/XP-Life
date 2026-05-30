import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Dumbbell } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function PersonalRecords() {
  const navigate = useNavigate();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPRs = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/', { replace: true }); return; }

      const { data, error } = await supabase
        .from('exercise_prs')
        .select('exercise_name, best_weight, best_reps, best_volume, achieved_at')
        .eq('user_id', session.user.id)
        .order('best_volume', { ascending: false });

      if (!error) setPrs(data || []);
      setLoading(false);
    };
    fetchPRs();
  }, [navigate]);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="prs-page animate-fade-in">
      {/* Header */}
      <div className="prs-page-header">
        <button className="prs-back-btn" onClick={() => navigate('/profile')}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="prs-page-title">Personal Records</h1>
      </div>

      {loading ? (
        <div className="prs-loading">Loading your PRs...</div>
      ) : prs.length === 0 ? (
        <div className="prs-empty">
          <Dumbbell size={48} className="prs-empty-icon" />
          <p className="prs-empty-title">No PRs Yet</p>
          <p className="prs-empty-sub">Log a workout to start tracking your Personal Records!</p>
        </div>
      ) : (
        <div className="prs-content">
          <p className="prs-subtitle">{prs.length} exercise{prs.length !== 1 ? 's' : ''} tracked</p>
          <div className="prs-list">
            {prs.map((pr, i) => (
              <div key={pr.exercise_name} className="pr-card">
                <div className="pr-rank">
                  {i === 0 ? <Trophy size={18} className="pr-rank-trophy" /> : <span className="pr-rank-num">#{i + 1}</span>}
                </div>
                <div className="pr-info">
                  <span className="pr-exercise-name">{pr.exercise_name}</span>
                  <span className="pr-date">Achieved {formatDate(pr.achieved_at)}</span>
                </div>
                <div className="pr-stats">
                  <div className="pr-stat-pill">
                    <span className="pr-stat-value">{pr.best_weight}<span className="pr-stat-unit">kg</span></span>
                  </div>
                  <span className="pr-stat-sep">×</span>
                  <div className="pr-stat-pill">
                    <span className="pr-stat-value">{pr.best_reps}<span className="pr-stat-unit">reps</span></span>
                  </div>
                </div>
                {/* Volume bar for visual ranking */}
                <div className="pr-volume-bar-wrap">
                  <div
                    className="pr-volume-bar"
                    style={{ width: `${Math.min(100, (pr.best_volume / (prs[0]?.best_volume || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
