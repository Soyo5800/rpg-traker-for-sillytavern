import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { defensiveMerge } from './JSONTracker';

const RPGContext = createContext(null);

const DEFAULT_SETTINGS = {
  enabled: true,
  autoUpdate: true,
  panelPosition: 'right',
  theme: 'default', // 💡 Theme mode: 'default' (Follow ST) or 'custom' (User defined)
  updateMode: 'merged', // 💡 API update mode: 'merged' (Inline with chat), 'separated' (Manual background)
  maxBackupCount: 4,

  showUserStats: true,
  showInfoBox: true,
  showCharacterThoughts: true,
  showInventory: true,
  showQuests: true,
  customColors: { // 💡 Default guide colors when custom mode is active
    bg: '#1a1a2e',
    accent: '#4a7ba7',
    text: '#ffffff',
    highlight: '#4a9eff',
    border: '#4a7ba7'
  }
};

import { getDefaultCharacters, DEFAULT_GUIDE_PROMPTS, getInitialTrackerData } from './PromptSchema';

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

  const saveTrackerDataToST = useCallback((updatedTracker) => {
    if (window.RPGBridge && typeof window.RPGBridge.saveChatData === 'function') {
      window.RPGBridge.saveChatData(updatedTracker, settings.maxBackupCount);
    }
  }, [settings.maxBackupCount]);

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

  useEffect(() => {
    if (window.RPGBridge) {
      window.RPGBridge.currentTrackerData = trackerData;
    }
  }, [trackerData]);

  useEffect(() => {
    window.RPGBridge = {
      ...(window.RPGBridge || {}),
      currentTrackerData: trackerData,
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
            // Fully reset if no past backup exists (keep master schema & rules intact by wrapping over the default structure)
            const baseData = prev; // Wait, actually we should use getDefaultTrackerData() but keep system config.
            // Let's implement a better reset: 
            const defaultData = getDefaultTrackerData();
            // We want to keep systemPrompt, globalDefinitions, addons from prev.
            const cleanBase = {
              ...defaultData,
              systemPromptHeader_merged: prev.systemPromptHeader_merged,
              systemPromptFooter_merged: prev.systemPromptFooter_merged,
              systemPromptHeader_separated: prev.systemPromptHeader_separated,
              systemPromptFooter_separated: prev.systemPromptFooter_separated,
              globalDefinitions: prev.globalDefinitions,
              addons: prev.addons
            };

            if (recovered) {
              return defensiveMerge(cleanBase, recovered);
            } else {
              return cleanBase;
            }
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
      handleFullRequestUpdate: async () => { console.log("[RPG Tracker] Full Overwrite Update is deprecated and disabled."); },
      resetToDefault: () => {
        setTrackerData(getDefaultTrackerData());
      }
    };

    console.log('[RPG Tracker] 🧠 RPGControl Bridge is initialized and listening.');

    return () => {
      // Don't delete window.RPGBridge entirely, as it might break the native side connection
    };
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
    setIsGenerating
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