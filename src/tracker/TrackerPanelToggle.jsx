import React, { useState, useEffect, useRef } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './TrackerPanelToggle.module.css';

export default function TrackerPanelToggle() {
  const { settings, updateSettings } = useRPG();
  const [isDragMode, setIsDragMode] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const menuRef = useRef(null);

  const position = settings.togglePosition;
  const isPanelOpen = settings.isPanelOpen || false;

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowContextMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPanelOpen) {
    return null;
  }

  const handleLeftClick = () => {
    if (isDragMode) return;
    updateSettings({ isPanelOpen: true });
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setShowContextMenu(true);
  };

  const startDrag = (e) => {
    if (!isDragMode || e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    const initX = position ? position.x : rect.left;
    const initY = position ? position.y : rect.top;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const nextX = Math.max(0, initX + deltaX);
      const nextY = Math.max(0, initY + deltaY);

      updateSettings({
        togglePosition: { x: nextX, y: nextY }
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startTouchDrag = (e) => {
    if (!isDragMode) return;

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    const initX = position ? position.x : rect.left;
    const initY = position ? position.y : rect.top;

    const onTouchMove = (moveEvent) => {
      const currentTouch = moveEvent.touches[0];
      const deltaX = currentTouch.clientX - startX;
      const deltaY = currentTouch.clientY - startY;

      const nextX = Math.max(0, initX + deltaX);
      const nextY = Math.max(0, initY + deltaY);

      updateSettings({
        togglePosition: { x: nextX, y: nextY }
      });
    };

    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  };

  const resetToDefault = () => {
    updateSettings({ togglePosition: null });
    setIsDragMode(false);
    setShowContextMenu(false);
  };

  // JS 인라인 스타일이 적용될 때는 CSS의 반응형 위치를 무시하게 만듦
  const dynamicInlineStyle = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : {};

  return (
    <div
      className={`${styles.toggleWrapper} ${isDragMode ? styles.dragModeActive : ''} ${position ? styles.userPositioned : ''}`}
      style={dynamicInlineStyle}
      onMouseDown={startDrag}
      onTouchStart={startTouchDrag}
      onContextMenu={handleContextMenu}
    >
      <button
        className={styles.toggleButton}
        onClick={handleLeftClick}
        title={isDragMode ? "Drag to re-position" : "Open Tracker / Right-click for options"}
      >
        <svg viewBox="0 0 24 24" className={styles.icon} fill="currentColor">
          <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="10" r="2.2" />
          <path d="M4 15.5c0-1.8 1.3-3 3-3s3 1.2 3 3v0.5H4v-0.5z" />
          <rect x="12" y="8.5" width="7" height="1.5" rx="0.75" />
          <rect x="12" y="11.5" width="6" height="1.5" rx="0.75" />
          <rect x="12" y="14.5" width="7" height="1.5" rx="0.75" />
        </svg>
      </button>

      {showContextMenu && (
        <div className={styles.contextMenu} ref={menuRef}>
          <button
            className={isDragMode ? styles.activeMenuBtn : ''}
            onClick={() => { setIsDragMode(!isDragMode); setShowContextMenu(false); }}
          >
            {isDragMode ? (
              <>
                <svg viewBox="0 0 24 24" className={styles.menuIcon} fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
                Lock Position
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className={styles.menuIcon} fill="currentColor">
                  <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z" />
                </svg>
                Enable Drag
              </>
            )}
          </button>
          <button onClick={resetToDefault}>
            <svg viewBox="0 0 24 24" className={styles.menuIcon} fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
            Reset Position
          </button>
        </div>
      )}
    </div>
  );
}