import React, { useState, useEffect, useRef } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './TrackerPanelToggle.module.css';
import { BrandIcon, LockIcon, MoveArrowsIcon, ResetArrowIcon } from '../Icons';

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
        <BrandIcon className={styles.icon} size={20} />
      </button>

      {showContextMenu && (
        <div className={styles.contextMenu} ref={menuRef}>
          <button
            className={isDragMode ? styles.activeMenuBtn : ''}
            onClick={() => { setIsDragMode(!isDragMode); setShowContextMenu(false); }}
          >
            {isDragMode ? (
              <>
                <LockIcon isLocked={true} className={styles.menuIcon} size={13} />
                Lock Position
              </>
            ) : (
              <>
                <MoveArrowsIcon className={styles.menuIcon} />
                Enable Drag
              </>
            )}
          </button>
          <button onClick={resetToDefault}>
            <ResetArrowIcon className={styles.menuIcon} />
            Reset Position
          </button>
        </div>
      )}
    </div>
  );
}