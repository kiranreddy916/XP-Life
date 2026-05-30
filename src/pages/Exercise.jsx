import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Dumbbell, ChevronRight, Sparkles, Flame } from 'lucide-react';

export default function Exercise() {
  const navigate = useNavigate();
  return (
    <div className="container exercise-page">
      {/* Page header */}
      <div className="exercise-header animate-slide-up">
        <h1 className="exercise-title">Exercise</h1>
        <p className="exercise-subtitle">Choose your path to greatness</p>
      </div>

      {/* Mode cards */}
      <div className="exercise-modes animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {/* The Story Mode Card */}
        <button className="exercise-mode-card story-mode" id="story-mode-btn">
          <div className="mode-glow story-glow" />
          <div className="mode-icon-wrapper story-icon-wrapper">
            <BookOpen className="mode-icon" />
            <Sparkles className="mode-sparkle" />
          </div>
          <div className="mode-info">
            <h2 className="mode-title">The Story Mode</h2>
            <p className="mode-description">
              Embark on epic quests and level up through adventure
            </p>
          </div>
          <ChevronRight className="mode-arrow" />
        </button>

        {/* Workout Logger Card */}
        <button className="exercise-mode-card workout-mode" id="workout-logger-btn" onClick={() => navigate('/workout-logger')}>
          <div className="mode-glow workout-glow" />
          <div className="mode-icon-wrapper workout-icon-wrapper">
            <Dumbbell className="mode-icon" />
            <Flame className="mode-flame" />
          </div>
          <div className="mode-info">
            <h2 className="mode-title">Workout Logger</h2>
            <p className="mode-description">
              Track sets, reps & PRs — own every session
            </p>
          </div>
          <ChevronRight className="mode-arrow" />
        </button>
      </div>

      {/* Future add-ons placeholder area */}
      <div className="exercise-coming-soon animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="coming-soon-divider">
          <span className="divider-line" />
          <span className="divider-text">More coming soon</span>
          <span className="divider-line" />
        </div>
        <div className="coming-soon-slots">
          <div className="coming-soon-slot">
            <div className="slot-pulse" />
          </div>
          <div className="coming-soon-slot">
            <div className="slot-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
