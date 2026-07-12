// src/utils.jsx
import React, { useRef, useEffect, useState } from 'react';

/**
 * Resolves SillyTavern avatar filenames to fully qualified browser-accessible asset URLs.
 */
export function resolveSillyTavernAvatarUrl(avatarFile, type = 'Card') {
  // 인자 타입 검증 가드 추가로 잘못된 형식 전달 시 일어나는 렌더러 다운 현상 차단
  if (!avatarFile || typeof avatarFile !== 'string') return '/img/user.png';
  if (avatarFile.startsWith('http://') || avatarFile.startsWith('https://') || avatarFile.startsWith('data:')) {
    return avatarFile;
  }

  // [캐릭터 카드] 기존 캐릭터 이미지 로딩 방식 유지
  if (type === 'Card' && typeof window.getAvatarPath === 'function') {
    const resolved = window.getAvatarPath(avatarFile);
    if (resolved && (resolved.startsWith('http') || resolved.startsWith('/') || resolved.startsWith('.'))) {
      return resolved;
    }
  }

  let filename = String(avatarFile);
  
  // 파일 경로 기호(/)가 함께 포함되어 넘어오는 경우 파일명만 안전하게 추출합니다
  if (filename.includes('/')) {
    filename = filename.split('/').pop();
  }

  if (type === 'Persona') {
    try { filename = decodeURIComponent(filename); } catch (e) {}

    // 1순위: 네이티브 브릿지에 등록된 실리터번 공식 API를 호출합니다.
    if (window.RPGBridge && typeof window.RPGBridge.getThumbnailUrl === 'function') {
      const url = window.RPGBridge.getThumbnailUrl('persona', filename);
      if (url) return url;
    }

    // 2순위: 비동기식 로드 지연 대비용 DOM 파싱 폴백
    try {
      const userAvatarImg = document.querySelector('#chat .mes.is_user .avatar img');
      if (userAvatarImg && userAvatarImg.src && !userAvatarImg.src.includes('user.png') && !userAvatarImg.src.includes('default')) {
        const domFileName = decodeURIComponent(userAvatarImg.src.split('/').pop());
        const targetBaseName = filename.split('.')[0];
        if (domFileName.startsWith(targetBaseName)) {
          return userAvatarImg.src;
        }
      }
    } catch (e) {}

    // 3순위: API 라우팅 폴백 처리 (실리터번 규격 API 엔드포인트 바인딩)
    const lower = filename.toLowerCase();
    if (lower === 'default.png' || lower === 'ghost.png' || lower === 'user.png' || lower === 'system.png' || lower === 'default-user' || lower === 'default') {
      return '/img/user.png';
    }
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
      filename += '.png';
    }
    return `/api/images/avatars/${encodeURIComponent(filename)}`;
  }

  const encoded = encodeURIComponent(filename);
  return `/characters/${encoded}`;
}

export function AutoGrowingTextArea({ value, onChange, placeholder, className, style, disabled }) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    adjustHeight();

    const resizeObserver = new ResizeObserver(() => {
      adjustHeight();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <textarea
      ref={textareaRef}
      className={className}
      style={{ resize: isFocused && !disabled ? 'vertical' : 'none', ...style }}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => {
        if (disabled) return;
        setIsFocused(true);
      }}
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
    />
  );
}