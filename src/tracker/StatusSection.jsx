// src/tracker/StatusSection.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './StatusSection.module.css';
import StatusComponent from './StatusComponent';
import CharListEditor from './CharListEditor';
import { getDefaultCharacters } from '../core/PromptSchema';

// 공통 Auto-Growing & Drag-Resize TextArea 컴포넌트 헬퍼
function AutoGrowingTextArea({ value, onChange, placeholder }) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      if (!isFocused) {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value, isFocused]);

  return (
    <textarea
      ref={textareaRef}
      className={styles.textBlockInput}
      style={{
        resize: isFocused ? 'vertical' : 'none'
      }}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => {
        setIsFocused(true);
        const el = textareaRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      placeholder={placeholder}
      rows={1}
    />
  );
}

export default function StatusSection({ onOpenEditor }) {
  const { trackerData, updateTrackerData, settings } = useRPG();
  const characters = (trackerData.characters && trackerData.characters.length > 0)
    ? trackerData.characters
    : getDefaultCharacters();
  const globalRelationSchema = settings.statsSchema?.filter(s => s.type === 'relation_schema') || [];

  const [collapsedChars, setCollapsedChars] = useState({});
  const [activeInlineTabs, setActiveInlineTabs] = useState({});
  const [activeEdit, setActiveEdit] = useState({ charId: null, statId: null });
  const [showCharList, setShowCharList] = useState(false);

  const handleUpdateCharacters = (nextChars) => {
    if (updateTrackerData) {
      updateTrackerData({ ...trackerData, characters: nextChars });
    }
  };

  const handleValueChange = (charId, statId, newVal) => {
    const updated = characters.map(c => {
      if (c.id === charId) {
        const schemaItem = (c.statsSchema || []).find(s => s.id === statId);
        let finalVal = newVal;
        if (schemaItem && schemaItem.type !== 'text') {
          const minLimit = schemaItem.min !== undefined && schemaItem.min !== null ? schemaItem.min : 0;
          const maxLimit = schemaItem.max !== undefined && schemaItem.max !== null ? schemaItem.max : 100;
          finalVal = Math.min(maxLimit, Math.max(minLimit, newVal));
        }
        return {
          ...c,
          stats: { ...c.stats, [statId]: finalVal }
        };
      }
      return c;
    });
    handleUpdateCharacters(updated);
  };

  const handlePatchCharacter = (charId, patchFn) => {
    const updated = characters.map(c => (c.id === charId ? patchFn(c) : c));
    handleUpdateCharacters(updated);
  };

  const toggleCollapse = (charId) => {
    setCollapsedChars(prev => ({ ...prev, [charId]: !prev[charId] }));
  };

  // 다중 활성화 지원: 이전 상태에서 해당 탭의 boolean 상태만 반전
  const handleToggleInlineTab = (charId, tabName) => {
    setActiveInlineTabs(prev => {
      const charTabs = prev[charId] || {
        profile: false,
        relations: false,
        inventory: false,
        quests: false
      };
      return {
        ...prev,
        [charId]: {
          ...charTabs,
          [tabName]: !charTabs[tabName]
        }
      };
    });
  };

  const closeEditMode = () => {
    setActiveEdit({ charId: null, statId: null });
  };

  return (
    <div className={styles.container}>
      <div className={styles.topActionBar}>
        <button 
          className={styles.topActionBtn} 
          onClick={() => {
            const newChar = { id: `char_${Date.now()}`, name: "New Character", activePlayer: false, activeInjection: true, statsSchema: [], stats: {}, relations: {} };
            let nextChars;
            if (characters.length === 1 && characters[0].id === 'char_user' && characters[0].name === 'New') {
              nextChars = [newChar];
            } else {
              nextChars = [...characters, newChar];
            }
            handleUpdateCharacters(nextChars);
          }}
        >
          + Add Character
        </button>
        <button 
          className={styles.topActionBtn} 
          onClick={() => setShowCharList(true)}
        >
          Character List
        </button>
      </div>

      {characters.map((char) => {
        const schema = (char.statsSchema || []).filter(s => s.type !== 'relation_schema');
        const dynamicStats = char.stats || {};

        const gaugeFields = schema.filter(item => ['stacking', 'consumable'].includes(item.type));
        const integerFields = schema.filter(item => item.type === 'integer');
        const textFields = schema.filter(item => item.type === 'text');

        const isCollapsed = collapsedChars[char.id];
        const charTabs = activeInlineTabs[char.id] || {};
        const isPlayerActive = char.activePlayer === true;
        const isInjectionActive = char.activeInjection !== false;

        // 탭이 하나라도 열려있는지 감지
        const hasActiveTab = Object.values(charTabs).some(v => v === true);

        return (
          <div key={char.id} className={styles.charBlock}>
            
            <header className={styles.blockHeader}>
              <div className={styles.headerLeft} onClick={() => toggleCollapse(char.id)}>
                <button 
                  type="button" 
                  className={`${styles.collapseArrowBtn} ${!isCollapsed ? styles.arrowExpanded : ''}`}
                >
                  ▶
                </button>
                <span className={styles.charName}>{char.name}</span>
              </div>

              <div className={styles.headerSwitches}>
                <label className={styles.switchRow} title="Enable Inventory and Quests Tab">
                  <span>Player</span>
                  <div className={styles.switchContainer}>
                    <input 
                      type="checkbox" 
                      checked={isPlayerActive} 
                      onChange={() => handlePatchCharacter(char.id, c => ({ ...c, activePlayer: !isPlayerActive }))} 
                    />
                    <span className={styles.switchSlider} />
                  </div>
                </label>

                <label className={styles.switchRow} title="Inject stats into AI context">
                  <span>Inject</span>
                  <div className={styles.switchContainer}>
                    <input 
                      type="checkbox" 
                      checked={isInjectionActive} 
                      onChange={() => handlePatchCharacter(char.id, c => ({ ...c, activeInjection: !isInjectionActive }))} 
                    />
                    <span className={styles.switchSlider} />
                  </div>
                </label>

                <button
                  type="button"
                  className={styles.settingsGearBtn}
                  title="Edit Character Spec & Schema"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEditor && onOpenEditor(char.id);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
            </header>

            {!isCollapsed && (
              <div className={styles.dashboardContainer}>
                
                <div className={styles.uniformControlGrid}>
                  <button 
                    type="button"
                    className={`${styles.iconGridBtn} ${charTabs.profile ? styles.activeGridBtn : ''}`}
                    onClick={() => handleToggleInlineTab(char.id, 'profile')}
                    title="Profile"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                  </button>

                  <button 
                    type="button"
                    className={`${styles.iconGridBtn} ${charTabs.relations ? styles.activeGridBtn : ''}`}
                    onClick={() => handleToggleInlineTab(char.id, 'relations')}
                    title="Relations"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </button>

                  {isPlayerActive && (
                    <>
                      <button 
                        type="button"
                        className={`${styles.iconGridBtn} ${charTabs.inventory ? styles.activeGridBtn : ''}`}
                        onClick={() => handleToggleInlineTab(char.id, 'inventory')}
                        title="Inventory"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-8-2h4v2h-4V4zm8 15H4V8h16v11z"/>
                        </svg>
                      </button>

                      <button 
                        type="button"
                        className={`${styles.iconGridBtn} ${charTabs.quests ? styles.activeGridBtn : ''}`}
                        onClick={() => handleToggleInlineTab(char.id, 'quests')}
                        title="Quest"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                      </button>

                      <div className={styles.avatarGridCell}>
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className={styles.avatarGridImage} />
                        ) : (
                          <div className={styles.avatarGridFallback}>
                            {char.name ? char.name.charAt(0).toUpperCase() : '?'}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 탭 미작동 시 내부 컴포넌트 높이가 축소되도록 제어 컨테이너 추가 */}
                <div className={`${styles.statusComponentContainer} ${hasActiveTab ? styles.tabActive : ''}`}>
                  <StatusComponent 
                    char={char}
                    characters={characters}
                    activeTabs={charTabs}
                    onPatchCharacter={(patchFn) => handlePatchCharacter(char.id, patchFn)}
                    onPatchOtherCharacter={(otherCharId, patchFn) => handlePatchCharacter(otherCharId, patchFn)}
                    globalRelationSchema={globalRelationSchema}
                    onOpenEditor={(tab) => onOpenEditor && onOpenEditor(char.id, tab)}
                  />
                </div>

                {gaugeFields.length > 0 && (
                  <div className={styles.gaugeGrid}>
                    {gaugeFields.map((item) => {
                      const rawValue = dynamicStats[item.id];
                      const currentValue = rawValue !== undefined ? rawValue : (item.max || 100);
                      const minLimit = item.min !== undefined && item.min !== null ? item.min : 0;
                      const maxLimit = item.max || 100;
                      const range = maxLimit - minLimit || 1;
                      const ratio = Math.min(100, Math.max(0, ((Number(currentValue) - minLimit) / range) * 100));
                      const isConsumable = item.type === 'consumable';
                      const isDanger = isConsumable && ratio <= 25;
                      const isEditing = activeEdit.charId === char.id && activeEdit.statId === item.id;

                      return (
                        <div key={item.id} className={styles.gaugeCard}>
                          <div className={styles.gaugeLabelRow}>
                            <div className={styles.gaugeLabelContainer}>
                              <svg onClick={() => {
                                const newSchema = [...char.statsSchema];
                                const idx = newSchema.findIndex(s => s.id === item.id);
                                if(idx !== -1) { newSchema[idx] = {...newSchema[idx], isLocked: !newSchema[idx].isLocked}; }
                                handlePatchCharacter(char.id, c => ({...c, statsSchema: newSchema}));
                              }} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${item.isLocked ? styles.lockIconActive : ''}`}>
                                {item.isLocked ? (
                                  <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                                ) : (
                                  <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                                )}
                              </svg>
                              <span className={`${styles.gaugeName} ${isDanger ? styles.dangerText : ''}`}>
                                {item.name || 'Unnamed'}
                              </span>
                            </div>
                            <div className={styles.gaugeValues}>
                              <input 
                                type="number" 
                                className={styles.smallNumberInput}
                                value={currentValue}
                                onChange={(e) => handleValueChange(char.id, item.id, Number(e.target.value))}
                              />
                              <span className={`${styles.gaugeMax} ${styles.gaugeMaxText}`}>/{item.max || 100}</span>
                            </div>
                          </div>
                          <div className={`${styles.gaugeTrack} ${isDanger ? styles.dangerTrack : ''}`}>
                            <div 
                              className={`${styles.gaugeFill} ${isDanger ? styles.dangerFlash : ''}`} 
                              style={{ 
                                width: `${ratio}%`,
                                backgroundColor: item.color || (isConsumable ? '#e74c3c' : '#3498db')
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {integerFields.length > 0 && (
                  <div className={styles.integerRowGrid}>
                    {integerFields.map((item) => {
                      const rawValue = dynamicStats[item.id];
                      const currentValue = rawValue !== undefined ? rawValue : 0;
                      const isEditing = activeEdit.charId === char.id && activeEdit.statId === item.id;

                      return (
                        <div key={item.id} className={styles.integerBlockCard}>
                          <div className={styles.integerFieldLeft}>
                            <svg onClick={() => {
                                const newSchema = [...char.statsSchema];
                                const idx = newSchema.findIndex(s => s.id === item.id);
                                if(idx !== -1) { newSchema[idx] = {...newSchema[idx], isLocked: !newSchema[idx].isLocked}; }
                                handlePatchCharacter(char.id, c => ({...c, statsSchema: newSchema}));
                              }} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${item.isLocked ? styles.lockIconActive : ''}`}>
                                {item.isLocked ? (
                                  <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                                ) : (
                                  <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                                )}
                            </svg>
                            <span className={styles.integerFieldName} title={item.name}>{item.name || 'Unnamed'}</span>
                          </div>
                          <div className={styles.integerFieldControlGroup}>
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); handleValueChange(char.id, item.id, Number(currentValue) - 1); }}
                              className={styles.integerRowBtn}
                            >
                              -
                            </button>
                            <input 
                              type="number" 
                              className={styles.smallNumberInput}
                              value={currentValue}
                              onChange={(e) => handleValueChange(char.id, item.id, Number(e.target.value))}
                            />
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); handleValueChange(char.id, item.id, Number(currentValue) + 1); }}
                              className={styles.integerRowBtn}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {textFields.length > 0 && (
                  <div className={styles.textStack}>
                    {textFields.map((item) => {
                      const rawValue = dynamicStats[item.id];
                      const currentValue = rawValue !== undefined ? rawValue : '';

                      return (
                        <div key={item.id} className={styles.textBlockCard}>
                          <svg onClick={() => {
                              const newSchema = [...char.statsSchema];
                              const idx = newSchema.findIndex(s => s.id === item.id);
                              if(idx !== -1) { newSchema[idx] = {...newSchema[idx], isLocked: !newSchema[idx].isLocked}; }
                              handlePatchCharacter(char.id, c => ({...c, statsSchema: newSchema}));
                            }} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${item.isLocked ? styles.lockIconActive : ''}`}>
                              {item.isLocked ? (
                                <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                              ) : (
                                <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                              )}
                          </svg>
                          <label className={styles.textBlockLabel}>{item.name || 'Unnamed'}</label>
                          <div className={styles.textBlockInputWrapper}>
                            <AutoGrowingTextArea
                              value={currentValue}
                              onChange={(val) => handleValueChange(char.id, item.id, val)}
                              placeholder={`Enter ${item.name || 'details'}...`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

          </div>
        );
      })}

      {showCharList && (
        <CharListEditor 
          onClose={() => setShowCharList(false)} 
          onOpenStatusEditor={(id) => {
            setShowCharList(false);
            if (onOpenEditor) onOpenEditor(id);
          }}
        />
      )}
    </div>
  );
}
