import React from 'react';
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
