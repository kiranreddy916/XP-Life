import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Project-wide prevention of browser back/forward edge-swipe navigation on iOS & Android
let startX = 0;
let startY = 0;
let isEdgeTouch = false;

window.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length > 0) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    const screenWidth = window.innerWidth;
    // Detect touches starting within 50px of left or right screen edges
    isEdgeTouch = startX <= 50 || startX >= screenWidth - 50;
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 0) {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = Math.abs(currentY - startY);

    // Cancel browser native edge swipe back/forward page navigation on iOS Safari and Android
    if (isEdgeTouch && (deltaX > 2 || Math.abs(deltaX) > deltaY)) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }
}, { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
