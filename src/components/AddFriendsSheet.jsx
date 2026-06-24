import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, KeyRound, Share2, Search, ArrowRight, UserPlus, Check, HelpCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function AddFriendsSheet({ isOpen, onClose, userProfile, onAddSuccess }) {
  const [activeTab, setActiveTab] = useState(null);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedUser, setSearchedUser] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Contacts specific state
  const [contactsPermission, setContactsPermission] = useState('prompt');
  const [contactList, setContactList] = useState([]);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);

  // Reset ALL state back to defaults every time the modal is closed
  // so it always opens fresh showing the 3 main buttons
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(null);
      setFriendCodeInput('');
      setSearchLoading(false);
      setSearchedUser(null);
      setSearchError('');
      setActionSuccess('');
      setCopiedLink(false);
      setContactsPermission('prompt');
      setContactList([]);
      setShowSettingsHelp(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const addUrl = `${window.location.origin}/add/${userProfile?.friend_code}`;

  // Tab selections
  const selectTab = (tab) => {
    setActiveTab(tab);
    setSearchedUser(null);
    setSearchError('');
    setActionSuccess('');
    setFriendCodeInput('');
  };

  // 1. Search by Code Action
  const handleSearchCode = async (e) => {
    e.preventDefault();
    if (!friendCodeInput.trim() || friendCodeInput.trim().length !== 8) {
      setSearchError('Friend code must be exactly 8 characters.');
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    setSearchedUser(null);
    setActionSuccess('');

    try {
      const code = friendCodeInput.trim().toUpperCase();
      
      // Query using the secure RPC to bypass RLS
      const { data, error } = await supabase.rpc('search_user_by_code', {
        p_code: code
      });

      if (error) throw error;

      if (!data) {
        setSearchError('No user found with this friend code.');
      } else if (data.id === userProfile.id) {
        setSearchError('This is your own friend code!');
      } else {
        setSearchedUser(data);
      }
    } catch (err) {
      console.error('Error searching friend code:', err);
      setSearchError('An error occurred during search.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendRequest = async (targetCode) => {
    setActionSuccess('');
    setSearchError('');
    try {
      const code = targetCode || friendCodeInput.trim().toUpperCase();
      const { data, error } = await supabase.rpc('send_friend_request', {
        p_friend_code: code
      });

      if (error) throw error;

      if (data && data.success) {
        setActionSuccess(data.message);
        if (onAddSuccess) onAddSuccess();
      } else {
        setSearchError(data?.error || 'Failed to send request.');
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
      setSearchError('Failed to send request.');
    }
  };

  // 2. Share Follow Link Actions
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(addUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  };

  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Add me on FitQuest!',
          text: `Hey, let's keep track of our streaks! Add me as a friend on FitQuest:`,
          url: addUrl
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  // 3. Contacts Flow
  const handleRequestContacts = async () => {
    setShowSettingsHelp(false);
    
    // Check if Contact Picker API is supported natively
    const isSupported = ('contacts' in navigator && 'ContactsManager' in window);
    
    if (isSupported) {
      try {
        const props = ['name', 'tel'];
        const contacts = await navigator.contacts.select(props, { multiple: true });
        
        if (contacts && contacts.length > 0) {
          setContactsPermission('granted');
          processContacts(contacts);
        }
      } catch (err) {
        console.error('Contacts Picker cancelled or failed:', err);
        setContactsPermission('denied');
        setShowSettingsHelp(true);
      }
    } else {
      // API not supported, trigger desktop/mobile simulated contacts authorization flow
      setContactsPermission('denied');
      setShowSettingsHelp(true);
    }
  };

  // Simulated test workflow to allow testing contact search on desktop/mobile browsers
  const handleSimulateContacts = async () => {
    setContactsPermission('granted');
    setShowSettingsHelp(false);
    
    // Mock mobile device contacts array
    const mockContacts = [
      { name: 'Admin User', tel: '555-0199' },
      { name: 'Fitness Buddy', tel: '555-1234' },
      { name: 'Coach Arnold', tel: '555-4567' },
      { name: 'XPLife Champion', tel: '555-7890' }
    ];
    
    processContacts(mockContacts);
  };

  const processContacts = async (contacts) => {
    setSearchLoading(true);
    setContactList([]);
    
    try {
      // Real Database match: Search profiles in Supabase whose username is similar to any contact name
      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('id, username, level, total_xp, friend_code, gender, profile_image_url');
        
      if (error) throw error;
      
      const matched = [];
      contacts.forEach(c => {
        const cleanName = c.name.toLowerCase().replace(/\s+/g, '');
        
        // Find matching profile in real data
        const match = allProfiles.find(p => {
          const cleanUsername = p.username.toLowerCase().replace('@', '');
          return cleanName.includes(cleanUsername) || cleanUsername.includes(cleanName);
        });

        matched.push({
          contactName: c.name,
          phone: c.tel ? c.tel[0] || c.tel : 'Unknown Number',
          matchedUser: match || null
        });
      });

      setContactList(matched);
    } catch (err) {
      console.error('Error processing contacts:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  return createPortal(
    <div className="bottom-sheet-overlay animate-fade-in" onClick={onClose}>
      <div className="bottom-sheet-content animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {/* Drag handle pill */}
        <div className="sheet-handle"></div>

        {/* Header */}
        <div className="sheet-header">
          <h2>Add Friends</h2>
          <button className="sheet-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* MAIN PANEL */}
        {activeTab === null && (
          <div className="sheet-tabs-grid">
            <button className="sheet-tab-button" onClick={() => selectTab('contacts')}>
              <div className="sheet-tab-icon-wrapper cyan">
                <Users size={24} />
              </div>
              <div className="sheet-tab-info">
                <span className="sheet-tab-title">Choose from Contacts</span>
                <span className="sheet-tab-desc">Sync mobile contacts to find friends</span>
              </div>
              <ArrowRight size={18} className="sheet-tab-chevron" />
            </button>

            <button className="sheet-tab-button" onClick={() => selectTab('code')}>
              <div className="sheet-tab-icon-wrapper gold">
                <KeyRound size={24} />
              </div>
              <div className="sheet-tab-info">
                <span className="sheet-tab-title">Search by Code</span>
                <span className="sheet-tab-desc">Enter a friend's unique 8-character ID</span>
              </div>
              <ArrowRight size={18} className="sheet-tab-chevron" />
            </button>

            <button className="sheet-tab-button" onClick={() => selectTab('share')}>
              <div className="sheet-tab-icon-wrapper pink">
                <Share2 size={24} />
              </div>
              <div className="sheet-tab-info">
                <span className="sheet-tab-title">Share follow link</span>
                <span className="sheet-tab-desc">Generate and copy shortened share link</span>
              </div>
              <ArrowRight size={18} className="sheet-tab-chevron" />
            </button>
          </div>
        )}

        {/* 1. TAB CONTENT: CONTACTS */}
        {activeTab === 'contacts' && (
          <div className="sheet-tab-pane">
            <div className="tab-pane-header">
              <button className="back-tab-btn" onClick={() => selectTab(null)}>← Back</button>
              <h3>Sync Contacts</h3>
            </div>

            {contactsPermission === 'prompt' && (
              <div className="contacts-prompt-card">
                <Users size={48} className="contacts-icon-pulsing" />
                <h4>Find Friends from Contacts</h4>
                <p>Allow access to contacts on this phone to automatically match friends registered on FitQuest.</p>
                
                <button className="btn-primary" onClick={handleRequestContacts} style={{ width: '100%', marginBottom: '10px' }}>
                  Choose from Contacts
                </button>
                <button className="btn-secondary" onClick={handleSimulateContacts} style={{ width: '100%', fontSize: '13px' }}>
                  Simulate Contacts (Desktop/Test mode)
                </button>
              </div>
            )}

            {/* Instruction Modal for Settings Access */}
            {showSettingsHelp && (
              <div className="settings-instruction-card animate-fade-in">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                  <HelpCircle size={24} color="var(--accent-gold)" />
                  <h4 style={{ margin: 0, color: 'var(--accent-gold)', fontWeight: '700' }}>Access Blocked or Unsupported</h4>
                </div>
                <p style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                  This browser does not support native contact sync or access is blocked. To sync contacts:
                </p>
                <ol className="settings-steps">
                  <li>Open <strong>Settings</strong> on your mobile device.</li>
                  <li>Go to <strong>Apps & Permissions</strong> &rarr; find your browser or <strong>FitQuest</strong> app.</li>
                  <li>Tap <strong>Permissions</strong> &rarr; and select <strong>Contacts</strong>.</li>
                  <li>Change setting to <strong>"Allow"</strong>.</li>
                  <li>Return here and try again!</li>
                </ol>
                <button className="btn-secondary" onClick={handleSimulateContacts} style={{ width: '100%', marginTop: '12px', fontSize: '13px' }}>
                  Skip & Try Simulator
                </button>
              </div>
            )}

            {contactsPermission === 'granted' && (
              <div className="contacts-list-wrapper">
                {searchLoading ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--accent-cyan)' }}>Searching profiles...</div>
                ) : contactList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>No contacts loaded.</div>
                ) : (
                  <div className="contacts-list">
                    {contactList.map((contact, idx) => (
                      <div key={idx} className="contact-item">
                        <div className="contact-avatar">
                          <Users size={20} />
                        </div>
                        <div className="contact-info">
                          <span className="contact-name">{contact.contactName}</span>
                          <span className="contact-details"><Phone size={10} style={{ display: 'inline', marginRight: '4px' }} />{contact.phone}</span>
                        </div>
                        <div className="contact-action">
                          {contact.matchedUser ? (
                            <button className="btn-primary btn-small" onClick={() => handleSendRequest(contact.matchedUser.friend_code)}>
                              <UserPlus size={14} style={{ marginRight: '4px' }} /> Add
                            </button>
                          ) : (
                            <button className="btn-secondary btn-small" onClick={handleCopyLink} style={{ opacity: 0.7 }}>
                              Invite
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. TAB CONTENT: SEARCH BY CODE */}
        {activeTab === 'code' && (
          <div className="sheet-tab-pane">
            <div className="tab-pane-header">
              <button className="back-tab-btn" onClick={() => selectTab(null)}>← Back</button>
              <h3>Search by Code</h3>
            </div>

            <form onSubmit={handleSearchCode} className="search-code-form">
              <div className="search-input-wrapper">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Enter 8-digit friend code (e.g. ABCD1234)"
                  value={friendCodeInput}
                  onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="input-field search-input"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn-primary search-submit-btn" disabled={searchLoading}>
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </form>

            {searchError && (
              <div className="search-feedback-card error animate-fade-in">
                {searchError}
              </div>
            )}

            {actionSuccess && (
              <div className="search-feedback-card success animate-fade-in" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={18} color="var(--accent-cyan)" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {searchedUser && (
              <div className="searched-user-card animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="searched-user-avatar">
                    {searchedUser.gender === 'male' ? '👨' : searchedUser.gender === 'female' ? '👩' : '👤'}
                  </div>
                  <div className="searched-user-info">
                    <span className="searched-username">@{searchedUser.username.replace('@', '')}</span>
                    <span className="searched-stats">Level {searchedUser.level} • {searchedUser.total_xp} XP</span>
                  </div>
                </div>
                <button className="btn-primary add-friend-btn" onClick={() => handleSendRequest(searchedUser.friend_code)}>
                  <UserPlus size={16} />
                  <span>Add Friend</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. TAB CONTENT: SHARE FOLLOW LINK */}
        {activeTab === 'share' && (
          <div className="sheet-tab-pane">
            <div className="tab-pane-header">
              <button className="back-tab-btn" onClick={() => selectTab(null)}>← Back</button>
              <h3>Share Follow Link</h3>
            </div>

            <div className="share-link-pane-body">
              <Share2 size={48} className="share-icon-accent" />
              <h4>Invite & Connect</h4>
              <p>Share your unique follow link. When clicked, it automatically redirects friends to add you in the app!</p>
              
              <div className="shortened-link-display">
                <span className="link-text">{addUrl}</span>
                <button className="copy-link-inline-btn" onClick={handleCopyLink}>
                  {copiedLink ? <Check size={18} color="var(--accent-cyan)" /> : <Share2 size={18} />}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                <button className="btn-primary" onClick={handleShareLink} style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                  <Share2 size={16} />
                  Share Link via Apps
                </button>
                <button className="btn-secondary" onClick={handleCopyLink} style={{ width: '100%' }}>
                  {copiedLink ? 'Copied to Clipboard!' : 'Copy Link URL'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
