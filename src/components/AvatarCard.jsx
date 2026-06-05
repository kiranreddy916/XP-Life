import React from 'react';
import AvatarViewer from './AvatarViewer';
import Avatar from './Avatar';
import { Flame, Zap, Trophy } from 'lucide-react';

export default function AvatarCard({
  username,
  level = 1,
  xp = 0,
  streak = 0,
  avatarUrl = null,
  profileImageUrl = null,
  gender = 'male',
  avatarConfig = null,
  interactive = false,
  cardStyle = {}
}) {
  const formatUsername = (name) => {
    if (!name) return '';
    return name.startsWith('@') ? name : `@${name}`;
  };

  const getLevelThreshold = (lvl) => {
    if (lvl < 10) return 100;
    if (lvl < 30) return 150;
    if (lvl < 50) return 200;
    if (lvl < 70) return 250;
    return 300;
  };

  const nextLevelXp = getLevelThreshold(level);
  const xpPercentage = Math.min(100, (xp / nextLevelXp) * 100);

  return (
    <div 
      className="glass-panel" 
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
        maxWidth: '340px',
        margin: '0 auto',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
        borderRadius: '24px',
        ...cardStyle
      }}
    >
      {/* 3D or 2D Avatar Display Container */}
      <div 
        style={{
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: 'radial-gradient(circle, rgba(102,252,241,0.05) 0%, rgba(11,12,16,0.4) 100%)',
          border: '2px solid rgba(102, 252, 241, 0.2)'
        }}
      >
        {avatarUrl && interactive ? (
          <div style={{ width: '100%', height: '140%', marginTop: '-20px' }}>
            <AvatarViewer avatarUrl={avatarUrl} height="100%" />
          </div>
        ) : profileImageUrl ? (
          <img 
            src={profileImageUrl} 
            alt={username} 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Avatar size={160} gender={gender} config={avatarConfig} />
        )}

        {/* Level Overlay badge */}
        <div 
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: 'var(--accent-cyan)',
            color: '#0b0c10',
            fontWeight: '800',
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '50px',
            boxShadow: '0 2px 10px rgba(102,252,241,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '3px'
          }}
        >
          <Trophy size={11} />
          Lvl {level}
        </div>
      </div>

      {/* User Info */}
      <div style={{ textAlign: 'center', width: '100%' }}>
        <h3 
          style={{ 
            fontSize: '18px', 
            fontWeight: '800', 
            margin: '0 0 4px 0', 
            color: 'white',
            letterSpacing: '-0.3px'
          }}
        >
          {formatUsername(username)}
        </h3>

        {/* Streak badge */}
        <div 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px',
            fontSize: '13px',
            color: '#FC909F', // Coral red for streaks
            fontWeight: '600',
            background: 'rgba(252, 144, 159, 0.1)',
            padding: '4px 10px',
            borderRadius: '50px',
            marginTop: '4px'
          }}
        >
          <Flame size={14} fill="#FC909F" />
          <span>{streak} Day Streak</span>
        </div>
      </div>

      {/* Progress Bar (XP) */}
      <div style={{ width: '100%', marginTop: '6px' }}>
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            marginBottom: '6px',
            fontWeight: '500'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Zap size={12} color="var(--accent-cyan)" />
            XP Progress
          </span>
          <span>{xp} / {nextLevelXp}</span>
        </div>
        
        {/* Track */}
        <div 
          style={{ 
            width: '100%', 
            height: '6px', 
            background: 'rgba(255, 255, 255, 0.1)', 
            borderRadius: '50px', 
            overflow: 'hidden' 
          }}
        >
          {/* Fill */}
          <div 
            style={{ 
              width: `${xpPercentage}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #66fcf1, #863bff)', 
              borderRadius: '50px',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      </div>
    </div>
  );
}
