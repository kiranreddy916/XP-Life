import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Dumbbell, Trophy, User, CheckSquare } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();
  
  // Don't show nav on login or onboarding screens
  const hideOn = ['/', '/onboarding', '/workout-logger'];
  if (hideOn.includes(location.pathname)) {
    return null;
  }

  return (
    <nav className="bottom-nav">
      <NavLink to="/home" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <Home className="nav-icon" />
        <span>Home</span>
      </NavLink>
      <NavLink to="/exercise" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <Dumbbell className="nav-icon" />
        <span>Exercise</span>
      </NavLink>
      <NavLink to="/checklist" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <CheckSquare className="nav-icon" />
        <span>Checklist</span>
      </NavLink>
      <NavLink to="/leaderboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <Trophy className="nav-icon" />
        <span>Leaderboard</span>
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <User className="nav-icon" />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}
