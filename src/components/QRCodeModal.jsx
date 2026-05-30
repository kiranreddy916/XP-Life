import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeModal({ isOpen, onClose, username, friendCode }) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!isOpen) return null;

  // The shortened deep-link
  const addUrl = `${window.location.origin}/add/${friendCode}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(addUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on FitQuest!',
          text: `Scan my QR code or use this link to add me as a friend:`,
          url: addUrl
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  return createPortal(
    <div className="rest-popup-overlay modal-overlay animate-fade-in" onClick={onClose}>
      <div className="settings-modal qr-modal animate-scale-up" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Your QR Code</h2>
          <button className="close-modal" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="qr-modal-body">
          <p className="qr-subtitle">Scan to add @{username.replace('@', '')} as a friend instantly</p>
          
          {/* QR Code Container */}
          <div className="qr-code-wrapper">
            <QRCodeSVG
              value={addUrl}
              size={180}
              bgColor="transparent"
              fgColor="#66fcf1"
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Friend Code card */}
          <div className="friend-code-card">
            <div className="friend-code-info">
              <span className="friend-code-label">YOUR FRIEND CODE</span>
              <span className="friend-code-value">{friendCode}</span>
            </div>
            <button className="friend-code-copy-btn" onClick={handleCopyCode}>
              {copied ? <Check size={18} color="var(--accent-cyan)" /> : <Copy size={18} />}
            </button>
          </div>

          {/* Actions */}
          <div className="qr-actions-row">
            <button className="btn-secondary qr-action-btn" onClick={handleCopyLink} style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
              {linkCopied ? (
                <>
                  <Check size={16} color="var(--accent-cyan)" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy Link
                </>
              )}
            </button>
            <button className="btn-primary qr-action-btn" onClick={handleShare} style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
              <Share2 size={16} />
              Share Link
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
