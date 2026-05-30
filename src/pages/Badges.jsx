import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export default function Badges() {
  const navigate = useNavigate();
  const [badgesByYear, setBadgesByYear] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBadges = async () => {
      const { data, error } = await supabase.rpc('get_user_badges');
      if (error) {
        console.error('Error fetching badges:', error);
        setLoading(false);
        return;
      }
      // Group by year (data comes sorted DESC, we want newest year first)
      const grouped = {};
      data.forEach(b => {
        if (!grouped[b.year]) grouped[b.year] = [];
        grouped[b.year].push(b);
      });
      // Sort each year's months ascending (Jan → Dec)
      Object.keys(grouped).forEach(y => {
        grouped[y].sort((a, b) => a.month - b.month);
      });
      setBadgesByYear(grouped);
      setLoading(false);
    };
    fetchBadges();
  }, []);

  const years = Object.keys(badgesByYear).sort((a, b) => b - a); // newest first

  return (
    <div className="badges-page animate-fade-in">
      {/* Header */}
      <div className="badges-page-header">
        <button className="badges-back-btn" onClick={() => navigate('/profile')}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="badges-page-title">Post Masculine Challenge</h1>
      </div>

      {loading ? (
        <div className="badges-loading">Loading badges...</div>
      ) : years.length === 0 ? (
        <div className="badges-empty">
          <p>No badges available yet.</p>
          <p>Complete all your daily tasks every day of a month to earn one!</p>
        </div>
      ) : (
        <div className="badges-content">
          {years.map(year => (
            <div key={year} className="badges-year-group">
              <h2 className="badges-year-title">{year} Badges</h2>
              <div className="badges-grid">
                {badgesByYear[year].map(badge => (
                  <div key={`${badge.year}-${badge.month}`} className="badge-grid-item">
                    <div className={`badge-grid-circle ${badge.status === 'achieved' ? 'badge-achieved' : 'badge-locked'}`}>
                      {badge.status === 'locked'
                        ? <Lock size={28} className="badge-lock-icon" />
                        : <img src={badge.image_url} alt={`${badge.year}-${badge.month}`} className="badge-grid-img" style={{ filter: badge.status === 'missed' ? 'grayscale(100%) blur(2px) opacity(60%)' : 'none' }} />}
                    </div>
                    <span className={`badge-grid-label ${badge.status === 'achieved' ? 'badge-label-achieved' : 'badge-label-locked'}`} style={{ color: badge.status === 'missed' ? '#888' : '' }}>
                      {new Date(year, badge.month - 1).toLocaleString('default', { month: 'short' }).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
