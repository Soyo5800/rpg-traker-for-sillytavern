// src/tracker/TrackerPanel.jsx
import React, { useState } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './TrackerPanel.module.css';

import StatusSection from './StatusSection';
import StatusEditor from './StatusEditor';
import PromptEditor from '../editor/PromptEditor';
import SettingsEditor from '../editor/SettingsEditor';
import WorldSection from './WorldSection';

export default function TrackerPanel() {
  const { settings, updateSettings, trackerData, isGenerating, setIsGenerating, isChatConnected } = useRPG();
  const [activeTab, setActiveTab] = useState('status');
  const [editorCharId, setEditorCharId] = useState(null);
  const [editorTab, setEditorTab] = useState('status');
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isPanelOpen = settings.isPanelOpen || false;
  const panelPosition = 'left';

  if (!isPanelOpen) {
    return null;
  }

  const handleClose = () => {
    updateSettings({ isPanelOpen: false });
  };

  return (
    <div className={`${styles.panelContainer} ${styles[panelPosition]}`}>
      {/* 접기 물리 버튼 */}
      <button
        className={`${styles.collapseButton} ${styles[panelPosition]}`}
        onClick={handleClose}
        title="Collapse Panel"
      >
        <svg viewBox="0 0 24 24" className={styles.collapseIcon} fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>

      {/* 상단 통합 헤더 */}
      <header className={styles.panelHeader}>
        <div className={styles.brand}>
          <svg viewBox="0 0 24 24" className={styles.headerIcon} fill="currentColor">
            <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="7" cy="10" r="2.2" />
            <path d="M4 15.5c0-1.8 1.3-3 3-3s3 1.2 3 3v0.5H4v-0.5z" />
            <rect x="12" y="8.5" width="7" height="1.5" rx="0.75" />
            <rect x="12" y="11.5" width="6" height="1.5" rx="0.75" />
            <rect x="12" y="14.5" width="7" height="1.5" rx="0.75" />
          </svg>
          <span className={styles.headerTitle}>RPG Tracker</span>
          <div 
            className={`${styles.statusDot} ${isChatConnected ? styles.statusDotConnected : styles.statusDotDisconnected}`} 
            title={isChatConnected ? "Connected to Chat" : "Disconnected"}
          />
        </div>
        <div className={styles.editorShortcuts} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {settings.updateMode === 'separated' && (
            <button 
              className={styles.shortcutBtn} 
              title="Update Status" 
              onClick={async () => {
                if (!isChatConnected) {
                  alert("Not connected to a chat room. Please connect to a chat room to use this feature.");
                  return;
                }
                if (window.RPGBridge && typeof window.RPGBridge.triggerManualUpdate === 'function') {
                  setIsGenerating(true);
                  try {
                    await window.RPGBridge.triggerManualUpdate();
                  } catch (e) {
                    console.error('[RPG Tracker] Manual update failed', e);
                  } finally {
                    setIsGenerating(false);
                  }
                }
              }}
              disabled={isGenerating}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '4px', 
                opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer'
              }}
            >
              <svg viewBox="0 0 24 24" className={styles.shortcutIcon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isGenerating ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Update Status</span>
            </button>
          )}
          <button className={styles.shortcutBtn} title="Prompt Editor" onClick={() => setShowPromptEditor(true)}>
            <svg viewBox="0 0 24 24" className={styles.shortcutIcon} fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
          <button className={styles.shortcutBtn} title="Settings" onClick={() => setShowSettings(true)}>
            <svg viewBox="0 0 24 24" className={styles.shortcutIcon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* 내비게이션 영역 */}
      <div className={styles.scrollContainer}>
        <div className={styles.contentWrapper}>
          <nav className={styles.panelNav}>
            {['status', 'world'].map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? styles.activeTab : ''}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'status' && 'Status'}
                {tab === 'world' && 'World'}
              </button>
            ))}
          </nav>

          <main className={styles.panelBody}>
            {activeTab === 'status' && (
              <StatusSection onOpenEditor={(charId, tab = 'status') => {
                setEditorCharId(charId);
                setEditorTab(tab);
              }} />
            )}

            {activeTab === 'world' && (
              <WorldSection />
            )}
          </main>
        </div>
      </div>

      {editorCharId && (
        <StatusEditor 
          charId={editorCharId} 
          initialTab={editorTab} 
          onClose={() => setEditorCharId(null)} 
        />
      )}

      {showPromptEditor && (
        <PromptEditor onClose={() => setShowPromptEditor(false)} />
      )}

      {showSettings && (
        <SettingsEditor onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
