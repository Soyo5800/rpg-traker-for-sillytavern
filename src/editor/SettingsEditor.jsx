import React, { useState, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './SettingsEditor.module.css';

export default function SettingsEditor({ onClose }) {
  const { settings, updateSettings, isChatConnected, trackerData } = useRPG();
  
  const [localUpdateMode, setLocalUpdateMode] = useState('merged');
  const [localShowDeltaLog, setLocalShowDeltaLog] = useState(true);

  useEffect(() => {
    setLocalUpdateMode(settings.updateMode || 'merged');
    setLocalShowDeltaLog(settings.showDeltaLog !== false);
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      ...settings,
      updateMode: localUpdateMode,
      showDeltaLog: localShowDeltaLog,
      maxBackupCount: 20 // 백업은 넉넉하게 20개로 고정하여 안정적인 O(1) 히스토리 롤백 복구를 보장합니다.
    });
    alert("Settings saved successfully.");
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h4>Settings</h4>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>

        <div className={styles.body}>
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

          <div className={styles.section} style={{ marginBottom: '12px', height: 'auto' }}>
            <div className={styles.rowFlex} style={{ justifyContent: 'flex-start', gap: '8px' }}>
              <input 
                id="show_delta_log"
                type="checkbox"
                checked={localShowDeltaLog}
                onChange={e => setLocalShowDeltaLog(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="show_delta_log" className={styles.label} style={{ cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                Show Stat Change Log
              </label>
            </div>
            <p className={styles.settingsDesc} style={{ marginTop: '4px', marginLeft: '24px' }}>
              Show collapsing delta change log at the bottom of AI messages.
            </p>
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
