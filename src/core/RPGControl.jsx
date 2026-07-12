// src/core/RPGControl.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { defensiveMerge, reconstructTurnState } from './JSONTracker';
import { getDefaultCharacters, DEFAULT_GUIDE_PROMPTS, getInitialTrackerData } from './PromptSchema';
import { setNestedValue, deleteNestedValue } from './StateHelpers';

const RPGContext = createContext(null);

const DEFAULT_SETTINGS = {
  enabled: true,
  autoUpdate: true,
  panelPosition: 'left',
  theme: 'default',
  updateMode: 'merged',
  maxBackupCount: 4,
  showUserStats: true,
  showInfoBox: true,
  showCharacterThoughts: true,
  showInventory: true,
  showQuests: true,
  presets: [],
  characterSyncs: {}, // 채팅방 ID별 캐릭터 싱크 매핑 정보 영구 저장
  customColors: {
    bg: '#1a1a2e',
    accent: '#4a7ba7',
    text: '#ffffff',
    highlight: '#4a9eff',
    border: '#4a7ba7'
  }
};

const getDefaultTrackerData = () => {
  return getInitialTrackerData();
};

export function RPGControlProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [trackerData, setTrackerData] = useState(getDefaultTrackerData);
  const [isChatConnected, setIsChatConnected] = useState(false);

  // 실시간 최신 설정 상태를 캡처하여 클로저 결함을 방지하는 참조 객체
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    if (window.RPGBridge) {
      window.RPGBridge.latestSettings = settings;
    }
  }, [settings]);

  // 스냅샷 모달
  const [snapshotModalData, setSnapshotModalData] = useState({ isOpen: false, mesId: null, historicalData: null });

  // 로컬스토리지에서 이전 UI 상태를 복구하거나 기본값으로 초기화
  const [uiState, setUiState] = useState(() => {
    try {
      const cached = localStorage.getItem('rpg_tracker_ui_state');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("[RPG Tracker] Failed to load UI state from localStorage:", e);
    }
    return {
      activeTab: 'status',
      collapsedChars: {},
      activeInlineTabs: {}
    };
  });

  // UI 상태가 변경될 때마다 로컬스토리지에 저장하여 새로고침 시에도 기억
  const updateUiState = useCallback((updates) => {
    setUiState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('rpg_tracker_ui_state', JSON.stringify(next));
      } catch (e) {
        console.warn("[RPG Tracker] Failed to save UI state to localStorage:", e);
      }
      return next;
    });
  }, []);

  const saveSettingsToST = useCallback((updatedSettings) => {
    if (window.RPGBridge && typeof window.RPGBridge.saveSettings === 'function') {
      window.RPGBridge.saveSettings(updatedSettings);
    }
  }, []);

  const saveTimeoutRef = useRef(null);
  const pendingDataRef = useRef(null);

  const executeSave = useCallback(() => {
    if (!pendingDataRef.current) return;

    if (window.RPGBridge && typeof window.RPGBridge.saveChatData === 'function') {
      window.RPGBridge.saveChatData(pendingDataRef.current, settings.maxBackupCount);
      pendingDataRef.current = null;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, [settings.maxBackupCount]);

  const saveTrackerDataToST = useCallback((updatedTracker) => {
    pendingDataRef.current = updatedTracker;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      executeSave();
    }, 500);
  }, [executeSave]);

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (window.RPGBridge) {
        window.RPGBridge.latestSettings = updated;
      }
      saveSettingsToST(updated);
      return updated;
    });
  }, [saveSettingsToST]);

  const updateTrackerData = useCallback((newTrackerData) => {
    setTrackerData((prev) => {
      const updated = { ...prev, ...newTrackerData };
      saveTrackerDataToST(updated);
      return updated;
    });
  }, [saveTrackerDataToST]);

  const patchCharacterField = useCallback((charId, pathArray, value) => {
    setTrackerData(prev => {
      const updatedChars = prev.characters.map(c => {
        if (c.id === charId) {
          return setNestedValue(c, pathArray, value);
        }
        return c;
      });
      const updatedData = { ...prev, characters: updatedChars };
      saveTrackerDataToST(updatedData);
      return updatedData;
    });
  }, [saveTrackerDataToST]);

  const deleteCharacterField = useCallback((charId, pathArray) => {
    setTrackerData(prev => {
      const updatedChars = prev.characters.map(c => {
        if (c.id === charId) {
          return deleteNestedValue(c, pathArray);
        }
        return c;
      });
      const updatedData = { ...prev, characters: updatedChars };
      saveTrackerDataToST(updatedData);
      return updatedData;
    });
  }, [saveTrackerDataToST]);

  const patchWorldField = useCallback((pathArray, value) => {
    setTrackerData(prev => {
      const updatedWorld = setNestedValue(prev.worldState || {}, pathArray, value);
      const updatedData = { ...prev, worldState: updatedWorld };
      saveTrackerDataToST(updatedData);
      return updatedData;
    });
  }, [saveTrackerDataToST]);

  // 캐릭터 동기화 이벤트를 전역 설정에 즉시 및 직접 보존 처리하는 제어기 (안정적인 배열 순서 색인으로 매핑)
  const syncCharacterToCard = useCallback((charId, target) => {
    const context = window.SillyTavern?.getContext?.() || {};
    const chatId = context.chatId;
    if (!chatId) return;

    setTrackerData(prev => {
      const charIndex = prev.characters.findIndex(c => c.id === charId);
      if (charIndex === -1) return prev;

      // 1. ST 백엔드 전역 설정 및 동기식 브릿지 캐시에 즉시 보존
      setSettings(prevSettings => {
        const nextSyncs = { ...(prevSettings.characterSyncs || {}) };
        nextSyncs[chatId] = { ...(nextSyncs[chatId] || {}) };

        if (!target || target.type === 'Unsync') {
          delete nextSyncs[chatId][charIndex];
          if (Object.keys(nextSyncs[chatId]).length === 0) {
            delete nextSyncs[chatId];
          }
        } else {
          nextSyncs[chatId][charIndex] = {
            syncedCardAvatar: target.avatarFile,
            syncedCardType: target.type,
            name: target.name,
            avatarUrl: target.avatarUrl
          };
        }

        const updated = { ...prevSettings, characterSyncs: nextSyncs };
        if (window.RPGBridge) {
          window.RPGBridge.latestSettings = updated;
        }
        saveSettingsToST(updated);
        return updated;
      });

      // 2. 현재 활성 메모리 세션의 타겟 상태에도 즉시 영구화 처리
      const updatedChars = prev.characters.map((c, idx) => {
        if (idx === charIndex) {
          if (!target || target.type === 'Unsync') {
            return { ...c, syncedCardAvatar: null, syncedCardType: null };
          }
          return {
            ...c,
            name: target.name,
            avatarUrl: target.avatarUrl,
            syncedCardAvatar: target.avatarFile,
            syncedCardType: target.type
          };
        }
        return c;
      });
      const updatedData = { ...prev, characters: updatedChars };
      saveTrackerDataToST(updatedData);
      return updatedData;
    });
  }, [saveSettingsToST, saveTrackerDataToST]);

  const revertToOriginalTurnState = useCallback(async () => {
    if (!window.RPGBridge) return;

    if (window.confirm("Are you sure you want to revert manual edits and restore the original AI-generated status for this turn?")) {
      try {
        const stContext = window.SillyTavern?.getContext?.();
        const chat = stContext?.chat;
        if (!Array.isArray(chat) || chat.length === 0) return;

        const originalState = await reconstructTurnState(chat, getDefaultTrackerData());

        if (originalState) {
          setTrackerData(originalState);
          if (window.RPGBridge && typeof window.RPGBridge.saveChatData === 'function') {
            window.RPGBridge.saveChatData(originalState, settings.maxBackupCount);
          }
          alert("Restored to the original turn state successfully.");
        }
      } catch (e) {
        console.error("[RPG Tracker] Reversion failed:", e);
        alert("Failed to revert state.");
      }
    }
  }, [settings.maxBackupCount]);

  useEffect(() => {
    if (window.RPGBridge) {
      window.RPGBridge.currentTrackerData = trackerData;
    }
  }, [trackerData]);

  useEffect(() => {
    window.RPGBridge = {
      ...(window.RPGBridge || {}),
      currentTrackerData: trackerData,

      flushSave: () => {
        executeSave();
      },

      syncSettings: (stSettings) => {
        if (stSettings) {
          setSettings((prev) => ({ ...prev, ...stSettings }));
        }
      },
      syncChatData: (stChatData) => {
        if (stChatData) {
          setTrackerData((prev) => {
            const defaultData = getDefaultTrackerData();
            const cleanBase = {
              ...defaultData,
              systemPromptHeader_merged: prev.systemPromptHeader_merged,
              systemPromptFooter_merged: prev.systemPromptFooter_merged,
              systemPromptHeader_separated: prev.systemPromptHeader_separated,
              systemPromptFooter_separated: prev.systemPromptFooter_separated,
              globalDefinitions: prev.globalDefinitions,
              addons: prev.addons
            };
            const merged = defensiveMerge(cleanBase, stChatData);
            
            // 세션 데이터 복원 시 지연 없는 브릿지 동기화 설정 오버레이 적용
            const context = window.SillyTavern?.getContext?.() || {};
            const chatId = context.chatId;
            const savedSyncs = window.RPGBridge?.getSTSettingsCharacterSyncs?.(chatId) 
              || settingsRef.current.characterSyncs?.[chatId];

            if (chatId && savedSyncs && Array.isArray(merged.characters)) {
              merged.characters.forEach((c, index) => {
                const saved = savedSyncs[index];
                if (saved) {
                  c.syncedCardAvatar = saved.syncedCardAvatar;
                  c.syncedCardType = saved.syncedCardType;
                  c.name = saved.name;
                  c.avatarUrl = saved.avatarUrl;
                }
              });
            }
            return merged;
          });
        }
      },
      setChatConnectionStatus: (status) => {
        setIsChatConnected(status);
      },
      triggerHistoryRollback: () => {
        if (window.RPGBridge && typeof window.RPGBridge.rehydrateFromHistory === 'function') {
          const recovered = window.RPGBridge.rehydrateFromHistory();
          setTrackerData((prev) => {
            const defaultData = getDefaultTrackerData();
            const cleanBase = {
              ...defaultData,
              systemPromptHeader_merged: prev.systemPromptHeader_merged,
              systemPromptFooter_merged: prev.systemPromptFooter_merged,
              systemPromptHeader_separated: prev.systemPromptHeader_separated,
              systemPromptFooter_separated: prev.systemPromptFooter_separated,
              globalDefinitions: prev.globalDefinitions,
              addons: prev.addons
            };
            const merged = recovered ? defensiveMerge(cleanBase, recovered) : cleanBase;

            const context = window.SillyTavern?.getContext?.() || {};
            const chatId = context.chatId;
            const savedSyncs = window.RPGBridge?.getSTSettingsCharacterSyncs?.(chatId) 
              || settingsRef.current.characterSyncs?.[chatId];

            if (chatId && savedSyncs && Array.isArray(merged.characters)) {
              merged.characters.forEach((c, index) => {
                const saved = savedSyncs[index];
                if (saved) {
                  c.syncedCardAvatar = saved.syncedCardAvatar;
                  c.syncedCardType = saved.syncedCardType;
                  c.name = saved.name;
                  c.avatarUrl = saved.avatarUrl;
                }
              });
            }
            return merged;
          });
        }
      },
      handleManualUpdate: async () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerManualUpdate === 'function') {
          try {
            await window.RPGBridge.triggerManualUpdate();
          } catch (e) {
            console.error('[RPG Tracker] Manual update failed:', e);
          }
        }
      },
      resetToDefault: () => {
        setTrackerData(() => {
          const defaultData = getDefaultTrackerData();
          const context = window.SillyTavern?.getContext?.() || {};
          const chatId = context.chatId;
          const savedSyncs = window.RPGBridge?.getSTSettingsCharacterSyncs?.(chatId) 
            || settingsRef.current.characterSyncs?.[chatId];

          if (chatId && savedSyncs && Array.isArray(defaultData.characters)) {
            defaultData.characters.forEach((c, index) => {
              const saved = savedSyncs[index];
              if (saved) {
                c.syncedCardAvatar = saved.syncedCardAvatar;
                c.syncedCardType = saved.syncedCardType;
                c.name = saved.name;
                c.avatarUrl = saved.avatarUrl;
              }
            });
          }
          return defaultData;
        });
      },
      //스냅샷
      openSnapshotModal: (mesId, historicalData, existingPayload = null) => {
        setSnapshotModalData({ isOpen: true, mesId, historicalData, existingPayload });
      },
      closeSnapshotModal: () => {
        setSnapshotModalData({ isOpen: false, mesId: null, historicalData: null, existingPayload: null });
      },
      triggerSnapshotRender: () => {
        const chatContainer = document.getElementById('chat');
        if (chatContainer) chatContainer.dispatchEvent(new Event('DOMSubtreeModified'));
      }
    };

    console.log('[RPG Tracker] RPGControl Bridge is initialized and listening.');
  }, []);

  const isEnabled = settings.enabled;

  useEffect(() => {
    const rootElement = document.getElementById('my-rpg-react-root');
    if (rootElement) {
      if (isEnabled) {
        rootElement.style.setProperty('display', 'block', 'important');
      } else {
        rootElement.style.setProperty('display', 'none', 'important');
      }
    }
  }, [isEnabled]);

  const value = {
    isEnabled,
    settings,
    trackerData,
    isChatConnected,
    snapshotModalData,
    uiState,          // 글로벌 보관 중인 UI 접힘 상태 전달
    updateUiState,    // 상태 업데이트 트리거 전달
    updateSettings,
    updateTrackerData,
    patchCharacterField,
    deleteCharacterField,
    patchWorldField,
    syncCharacterToCard, // UI 컴포넌트에서 직접 호출 가능한 동기화 API 바인딩
    revertToOriginalTurnState
  };

  return (
    <RPGContext.Provider value={value}>
      {children}
    </RPGContext.Provider>
  );
}

export function useRPG() {
  const context = useContext(RPGContext);
  if (!context) {
    throw new Error('useRPG must be used within an RPGControlProvider');
  }
  return context;
}