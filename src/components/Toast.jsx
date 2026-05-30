import React, { useEffect, useState } from 'react';

export default function Toast({ title, message, onClose, onDone, duration = 3000 }) {
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    const hideTimer = setTimeout(() => {
      setIsHiding(true);
    }, duration - 400); // Start hiding animation 400ms before duration ends

    const closeTimer = setTimeout(() => {
      onClose();
      onDone?.(); // Fire next toast in chain if provided
    }, duration);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose, onDone]);

  return (
    <div className="toast-container">
      <div className={`toast ${isHiding ? 'toast-hiding' : ''}`}>
        <div className="toast-title">{title}</div>
        {message && <div className="toast-message">{message}</div>}
      </div>
    </div>
  );
}
