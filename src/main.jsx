import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Prevent native browser edge-swipe back/forward history navigation on iOS and Android
let isEdgeTouch = false;

window.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length > 0) {
    const touchX = e.touches[0].clientX;
    const screenWidth = window.innerWidth;
    // If touch originates within 35px of left or right edge of screen
    isEdgeTouch = touchX < 35 || touchX > screenWidth - 35;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (isEdgeTouch) {
    // Cancel native browser edge-swipe gesture
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
