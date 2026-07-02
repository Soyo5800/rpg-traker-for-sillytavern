// src/utils.jsx
import React, { useRef, useEffect, useState } from 'react';

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

  // 글을 쓸 때(value 변경) 텍스트 높이를 즉각 반영하기 위한 훅
  useEffect(() => {
    adjustHeight();
  }, [value]);

  // 2. 컴포넌트 최초 마운트 시 ResizeObserver를 딱 한 번만 등록, 옵저버가 크기 변경, 사이드바 개폐, 탭 전환(hidden -> show)을 모두 감지하여 높이 맞춤
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    adjustHeight(); // 최초 가시화 시점 높이 계산

    const resizeObserver = new ResizeObserver(() => {
      adjustHeight();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect(); // 컴포넌트 언마운트 시 정리
    };
  }, []); // 빈 배열로 설정하여 불필요한 재등록 방지

  return (
    <textarea
      ref={textareaRef}
      className={className}
      // 포커스 되었을 때만 수동 조절(vertical) 허용하는 비주얼 효과를 유지하면서 외부 스타일과 결합
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