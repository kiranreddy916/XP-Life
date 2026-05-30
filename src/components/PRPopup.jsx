import React, { useState, useEffect, useRef } from 'react';

// 11 Celebratory PR messages — {name} and {exercise} are replaced dynamically
const PR_MESSAGES = [
  "{name}, Congrats 🏆 You absolutely crushed your PR in {exercise}! Beast mode unlocked! 🔥",
  "LEGENDARY! {name} just shattered the PR in {exercise} 💥 This is what greatness looks like!",
  "{name}, you're on fire! 🔥 New PR in {exercise} — the iron bowed to you today! 💪",
  "History was made today! {name} set a brand-new PR in {exercise} 🎉 Keep pushing, champion!",
  "{name}, the grind just paid off! 🏅 You smashed your PR in {exercise}. Unstoppable!",
  "INCREDIBLE! {name}, you hit a new high in {exercise} 🚀 Your hard work is writing its own legend!",
  "{name} just rewrote the record books 📖✨ New PR in {exercise} — absolutely elite performance!",
  "The bar begs for mercy! {name} dominated {exercise} with a brand-new PR 🔱 You're built different!",
  "{name}, champions are made in moments like this 🥇 New PR in {exercise} — celebrate this win!",
  "No cap, {name} just went full beast mode in {exercise} 🐉 New PR! The gym belongs to you!",
  "{name}, the dedication shows! 💎 You set a new PR in {exercise} — this is YOUR moment. Own it! 🌟",
];

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function PRPopup({ username, prsQueue, onAllDone }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const messageQueueRef = useRef([]);

  // Initialise shuffled message queue once
  useEffect(() => {
    messageQueueRef.current = shuffleArray(PR_MESSAGES);
  }, []);

  // Show popup when there are PRs to show
  useEffect(() => {
    if (prsQueue && prsQueue.length > 0) {
      setCurrentIndex(0);
      setIsVisible(true);
      setIsExiting(false);
    }
  }, [prsQueue]);

  if (!isVisible || !prsQueue || prsQueue.length === 0) return null;

  const exerciseName = prsQueue[currentIndex];

  // Pick next message from shuffled queue (refill if exhausted)
  if (messageQueueRef.current.length === 0) {
    messageQueueRef.current = shuffleArray(PR_MESSAGES);
  }
  const rawMessage = messageQueueRef.current[currentIndex % messageQueueRef.current.length];
  const displayMessage = rawMessage
    .replace('{name}', username || 'Champion')
    .replace('{exercise}', exerciseName);

  const handleNext = () => {
    setIsExiting(true);
    setTimeout(() => {
      const nextIndex = currentIndex + 1;
      if (nextIndex < prsQueue.length) {
        setCurrentIndex(nextIndex);
        setIsExiting(false);
      } else {
        setIsVisible(false);
        onAllDone?.();
      }
    }, 350);
  };

  return (
    <div className="pr-overlay" onClick={handleNext}>
      <div
        className={`pr-popup ${isExiting ? 'pr-popup-exit' : 'pr-popup-enter'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Shimmer strip */}
        <div className="pr-shimmer" />

        {/* Trophy icon */}
        <div className="pr-trophy">🏆</div>

        {/* PR Badge */}
        <div className="pr-badge">NEW PR  +10 XP</div>

        {/* Message */}
        <div className="pr-message">{displayMessage}</div>

        {/* Counter dots */}
        {prsQueue.length > 1 && (
          <div className="pr-dots">
            {prsQueue.map((_, i) => (
              <div
                key={i}
                className={`pr-dot ${i === currentIndex ? 'pr-dot-active' : i < currentIndex ? 'pr-dot-done' : ''}`}
              />
            ))}
          </div>
        )}

        {/* CTA Button */}
        <button className="pr-btn" onClick={handleNext} id="pr-popup-btn">
          {currentIndex < prsQueue.length - 1 ? 'Next PR 🔥' : "Let's Go! 💪"}
        </button>

        {/* Hint */}
        <div className="pr-hint">Tap anywhere to continue</div>
      </div>
    </div>
  );
}
