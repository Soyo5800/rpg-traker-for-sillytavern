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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatConnected, setIsChatConnected] = useState(false);

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
            return defensiveMerge(cleanBase, stChatData);
          });
        }
      },
      setChatConnectionStatus: (status) => {
        setIsChatConnected(status);
      },
      setGenerationState: (generating) => {
        setIsGenerating(generating);
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
            return recovered ? defensiveMerge(cleanBase, recovered) : cleanBase;
          });
        }
      },
      handleManualUpdate: async () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerManualUpdate === 'function') {
          setIsGenerating(true);
          try {
            await window.RPGBridge.triggerManualUpdate();
          } catch (e) {
            console.error('[RPG Tracker] Manual update failed:', e);
          } finally {
            setIsGenerating(false);
          }
        }
      },
      handleFullRequestUpdate: async () => {
        console.log("[RPG Tracker] Full Overwrite Update is deprecated.");
      },
      resetToDefault: () => {
        setTrackerData(getDefaultTrackerData());
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
    isGenerating,
    isChatConnected,
    updateSettings,
    updateTrackerData,
    setIsGenerating,
    patchCharacterField,
    deleteCharacterField,
    patchWorldField,
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