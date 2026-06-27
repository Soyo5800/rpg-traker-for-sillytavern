import React, { useState, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './SettingsEditor.module.css';

export default function SettingsEditor({ onClose }) {
  const { settings, updateSettings, isChatConnected, trackerData } = useRPG();
  
  const [localUpdateMode, setLocalUpdateMode] = useState('merged');

  useEffect(() => {
    setLocalUpdateMode(settings.updateMode || 'merged');
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      ...settings,
      updateMode: localUpdateMode,

      maxBackupCount: 20 // 백업은 넉넉하게 20개로 고정하여 안정적인 O(1) 히스토리 롤백 복구를 보장합니다.
    });
    alert("Settings saved successfully.");
    onClose();
  };

  const handleConnect = () => {
    if (window.RPGBridge && typeof window.RPGBridge.connectChat === 'function') {
      window.RPGBridge.connectChat(trackerData);
    }
  };

  const handleDisconnect = () => {
    if (window.confirm("Are you sure you want to disconnect RPG Tracker from this chat? All tracker data for this specific chat will be removed.")) {
      if (window.RPGBridge && typeof window.RPGBridge.disconnectChat === 'function') {
        window.RPGBridge.disconnectChat();
      }
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h4>Settings</h4>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>

        <div className={styles.body}>
          <div className={`${styles.section} ${styles.chatConnectionSection}`}>
            <label className={styles.label}>Chat Connection</label>
            <p className={styles.settingsDescLarge}>
              Connect RPG Tracker to the current chat to start injecting prompts and tracking data.
            </p>
            <div className={styles.connectionStatusCard}>
              <div className={styles.rowFlex}>
                <div className={`${styles.statusDot} ${isChatConnected ? styles.statusDotConnected : styles.statusDotDisconnected}`}></div>
                <span className={styles.statusText}>
                  {isChatConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {isChatConnected ? (
                <button onClick={handleDisconnect} className={styles.disconnectBtn}>
                  Disconnect
                </button>
              ) : (
                <button onClick={handleConnect} className={styles.connectBtn}>
                  Connect to Chat
                </button>
              )}
            </div>
          </div>

          <div className={styles.section} style={{ marginBottom: '12px' }}>
            <label className={styles.label}>Update Mode</label>
            <p className={styles.settingsDesc} style={{ marginBottom: '6px' }}>
              Choose how the tracker syncs data with the AI.
            </p>
            <select 
              value={localUpdateMode}
              onChange={e => setLocalUpdateMode(e.target.value)}
              className={styles.settingsSelect}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '4px' }}
            >
              <option value="merged">Merged (Update alongside chat messages)</option>
              <option value="separated">Separated (Manual background update)</option>
            </select>
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
        </footer>
      </div>
    </div>
  );
}
