import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Exercise from './pages/Exercise';
import WorkoutLogger from './pages/WorkoutLogger';
import Profile from './pages/Profile';
import Checklist from './pages/Checklist';
import Badges from './pages/Badges';
import PersonalRecords from './pages/PersonalRecords';
import Leaderboard from './pages/Leaderboard';
import AddByCode from './pages/AddByCode';
import BottomNav from './components/BottomNav';
import './App.css';

function App() {
  useEffect(() => {
    // Attempt native lock first
    try {
      if (window.screen?.orientation?.lock) {
        window.screen.orientation.lock('portrait').catch(e => console.warn('Native lock blocked:', e));
      }
    } catch (e) {
      console.error(e);
    }

    // Force CSS orientation lock for devices that ignore native lock
    const handleOrientation = () => {
      const angle = window.screen?.orientation?.angle || window.orientation || 0;
      const root = document.getElementById('root');
      if (!root) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      if (angle === 90) {
        // Rotated left
        root.style.transform = 'rotate(-90deg) translateX(-100%)';
        root.style.transformOrigin = 'top left';
        root.style.width = `${h}px`;
        root.style.height = `${w}px`;
        root.style.position = 'absolute';
        document.body.style.overflow = 'hidden';
      } else if (angle === -90 || angle === 270) {
        // Rotated right
        root.style.transform = 'rotate(90deg) translateY(-100%)';
        root.style.transformOrigin = 'top left';
        root.style.width = `${h}px`;
        root.style.height = `${w}px`;
        root.style.position = 'absolute';
        document.body.style.overflow = 'hidden';
      } else {
        // Portrait
        root.style.transform = '';
        root.style.transformOrigin = '';
        root.style.width = '100%';
        root.style.height = '100%';
        root.style.position = 'relative';
        document.body.style.overflow = '';
      }
    };

    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('resize', handleOrientation);
    handleOrientation(); // Init

    return () => {
      window.removeEventListener('orientationchange', handleOrientation);
      window.removeEventListener('resize', handleOrientation);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/exercise" element={<Exercise />} />
          <Route path="/workout-logger" element={<WorkoutLogger />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/add/:code" element={<AddByCode />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/badges" element={<Badges />} />
          <Route path="/prs" element={<PersonalRecords />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
