// src/utils.jsx
import React, { useRef, useEffect, useState } from 'react';

// Resolves SillyTavern avatar filenames to browser-accessible URLs, returning null for default/unsynced states
export function resolveSillyTavernAvatarUrl(avatarFile, type = 'Card') {
  if (!avatarFile || typeof avatarFile !== 'string') return null;
  if (avatarFile.startsWith('http://') || avatarFile.startsWith('https://') || avatarFile.startsWith('data:')) {
    return avatarFile;
  }

  let filename = String(avatarFile);
  if (filename.includes('/')) {
    filename = filename.split('/').pop();
  }

  try { filename = decodeURIComponent(filename); } catch (e) { }

  const lower = filename.toLowerCase();

  // Return null for default or placeholder filenames to prevent 404 network requests in console
  if (
    lower === 'default.png' || lower === 'ghost.png' || lower === 'user.png' ||
    lower === 'system.png' || lower === 'default-user' || lower === 'default' ||
    lower === 'user-default.png' || lower === 'user-default' || lower === 'none' ||
    lower === ''
  ) {
    return null;
  }

  if (type === 'Card') {
    if (typeof window.getAvatarPath === 'function') {
      const resolved = window.getAvatarPath(avatarFile);
      if (resolved && (resolved.startsWith('http') || resolved.startsWith('/') || resolved.startsWith('.'))) {
        return resolved;
      }
    }
    const encoded = encodeURIComponent(filename);
    return `/characters/${encoded}`;
  }

  if (type === 'Persona') {
    if (window.RPGBridge && typeof window.RPGBridge.getThumbnailUrl === 'function') {
      const url = window.RPGBridge.getThumbnailUrl('persona', filename);
      if (url) return url;
    }

    if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
      filename += '.png';
    }
    return `/api/images/avatars/${encodeURIComponent(filename)}`;
  }

  return null;
}

export function AutoGrowingTextArea({ value, onChange, placeholder, className, style, disabled }) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      if (!value || String(value).trim() === '') {
        el.style.height = '';
      } else {
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className={className}
      style={{ resize: isFocused && !disabled ? 'vertical' : 'none', ...style }}
      value={value || ''}
      onChange={(e) => {
        onChange(e.target.value);
        adjustHeight();
      }}
      onFocus={() => {
        if (disabled) return;
        setIsFocused(true);
        adjustHeight();
      }}
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
    />
  );
}