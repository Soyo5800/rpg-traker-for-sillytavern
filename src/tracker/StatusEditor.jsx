// src/tracker/StatusEditor.jsx
import React, { useState, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './StatusEditor.module.css';

import { DEFAULT_SCHEMAS, DEFAULT_STATS, getDefaultCharacters } from '../core/PromptSchema';

// StatusEditor 컴포넌트: Roster 생성 버튼 역할 및 개 개별 캐릭터 ID를 받아 스펙 에디터 모달 역할 수행
export default function StatusEditor({ charId, initialTab = 'status', onClose, characters, onUpdateCharacters }) {
  const { trackerData, updateTrackerData } = useRPG();
  const [localCharacters, setLocalCharacters] = useState(() => {
    const getActiveCharacters = () => {
      if (trackerData.characters && trackerData.characters.length > 0) return trackerData.characters;
      if (characters && characters.length > 0) return characters;
      return getDefaultCharacters();
    };
    const origCharacters = getActiveCharacters();
    return JSON.parse(JSON.stringify(origCharacters));
  });
  const [expandedIds, setExpandedIds] = useState({});
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dragItem, setDragItem] = useState(null);

  const handleDragStart = (e, loc, key, index, item) => {
    setDragItem({ loc, key, index, item });
  };

  const handleDrop = (e, destLoc, destKey) => {
    e.preventDefault();
    if (!dragItem) return;

    const targetChar = localCharacters.find(c => c.id === charId);
    if (!targetChar) return;

    const nextEquip = { ...(targetChar.featuresData?.inventory?.equipment || {}) };
    const nextStorage = { ...(targetChar.featuresData?.inventory?.storage || {}) };

    if (dragItem.loc === 'equipment') {
      nextEquip[dragItem.key] = null;
    } else {
      nextStorage[dragItem.key] = (nextStorage[dragItem.key] || []).filter((_, i) => i !== dragItem.index);
    }

    if (destLoc === 'equipment') {
      const displaced = nextEquip[destKey];
      nextEquip[destKey] = dragItem.item;
      if (displaced) {
        const firstStore = Object.keys(nextStorage)[0] || 'backpack';
        if (!nextStorage[firstStore]) nextStorage[firstStore] = [];
        nextStorage[firstStore].push(displaced);
      }
    } else {
      if (!nextStorage[destKey]) nextStorage[destKey] = [];
      nextStorage[destKey].push(dragItem.item);
    }

    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      return {
        ...c,
        featuresData: {
          ...(c.featuresData || {}),
          inventory: { equipment: nextEquip, storage: nextStorage }
        }
      };
    }));
    setDragItem(null);
  };

  useEffect(() => {
    const getActiveCharacters = () => {
      if (trackerData.characters && trackerData.characters.length > 0) return trackerData.characters;
      if (characters && characters.length > 0) return characters;
      return getDefaultCharacters();
    };
    const origCharacters = getActiveCharacters();
    setLocalCharacters(JSON.parse(JSON.stringify(origCharacters)));
  }, [trackerData.characters, characters]);

  // --- Roster 추가 버튼 기능 (charId가 없을 때) ---
  const handleAddCharacter = () => {
    const name = "New Character";

    const newChar = {
      id: `char_${Date.now()}`,
      name: name,
      activePlayer: false,
      activeInjection: true,
      statsSchema: JSON.parse(JSON.stringify(DEFAULT_SCHEMAS)),
      stats: { ...DEFAULT_STATS },
      relations: {}
    };

    const currentList = localCharacters;
    let nextChars;
    if (currentList.length === 1 && currentList[0].id === 'char_user' && currentList[0].name === 'New') {
      nextChars = [newChar];
    } else {
      nextChars = [...currentList, newChar];
    }

    if (onUpdateCharacters) {
      onUpdateCharacters(nextChars);
    } else if (updateTrackerData) {
      updateTrackerData({
        ...trackerData,
        characters: nextChars
      });
    }
  };

  if (!charId) {
    return (
      <button 
        type="button" 
        className={styles.addCharMainBtn}
        onClick={handleAddCharacter}
      >
        + Add Character
      </button>
    );
  }

  // --- 스펙 에디터 모달 기능 (charId가 존재할 때) ---
  const targetChar = localCharacters.find(c => c.id === charId);

  if (!targetChar) {
    return null;
  }

  const targetSchema = (targetChar.statsSchema || []).filter(s => s.type !== 'relation_schema');

  const getGroupedFields = (schema) => ({
    gauge: schema.filter(item => ['stacking', 'consumable'].includes(item.type)),
    integer: schema.filter(item => item.type === 'integer'),
    text: schema.filter(item => item.type === 'text')
  });

  const handleAddStat = (type) => {
    const statId = `stat_${Date.now()}`;
    const newField = { 
      id: statId, 
      name: 'New Field', 
      type, 
      min: type !== 'text' ? 0 : null,
      max: type !== 'text' ? 100 : null,
      color: type === 'stacking' ? '#3498db' : (type === 'consumable' ? '#e74c3c' : undefined),
      isLocked: false,
      isInject: true
    };
    setLocalCharacters(localCharacters.map(c => 
      c.id === charId 
        ? { 
            ...c, 
            statsSchema: [...(c.statsSchema || []), newField], 
            stats: { ...c.stats, [statId]: type === 'text' ? '' : 0 } 
          } 
        : c
    ));
    setExpandedIds(prev => ({ ...prev, [statId]: true }));
  };

  const updateSchemaField = (id, key, val) => {
    setLocalCharacters(localCharacters.map(c => 
      c.id === charId 
        ? { ...c, statsSchema: (c.statsSchema || []).map(s => s.id === id ? { ...s, [key]: val } : s) } 
        : c
    ));
  };

  const handleUpdateNestedField = (group, key, val) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const currentData = c.featuresData || {};
      const currentGroup = currentData[group] || {};
      return {
        ...c,
        featuresData: {
          ...currentData,
          [group]: key === null ? val : { ...currentGroup, [key]: val }
        }
      };
    }));
  };

  const handleUpdateRelations = (targetName, action, data) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const nextRelations = { ...(c.relations || {}) };
      if (action === 'add') {
        if (!nextRelations[targetName]) {
          nextRelations[targetName] = { text: '', targetText: '', isLocked: false, isInject: true, values: { 'Affection': 0 }, targetValues: {} };
        }
      } else if (action === 'remove') {
        delete nextRelations[targetName];
      } else if (action === 'updateField') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        if (data.field === 'text') {
          targetData.text = data.value;
        } else if (data.field === 'targetText') {
          targetData.targetText = data.value;
        } else {
          const old = targetData.values[data.field];
          if (typeof old === 'object' && old !== null) {
            targetData.values[data.field] = { ...old, value: data.value };
          } else {
            targetData.values[data.field] = data.value;
          }
        }
        nextRelations[targetName] = targetData;
      } else if (action === 'updateTargetMetricField') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = targetData.targetValues || {};
        const old = targetData.targetValues[data.field];
        if (typeof old === 'object' && old !== null) {
          targetData.targetValues[data.field] = { ...old, value: data.value };
        } else {
          targetData.targetValues[data.field] = data.value;
        }
        nextRelations[targetName] = targetData;
      } else if (action === 'updateMetricConfig') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        const mKey = data.metric;
        const old = targetData.values[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, type: 'integer' };
        targetData.values[mKey] = { ...currentObj, ...data.config };
        nextRelations[targetName] = targetData;
      } else if (action === 'updateTargetMetricConfig') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = targetData.targetValues || {};
        const mKey = data.metric;
        const old = targetData.targetValues[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, type: 'integer' };
        targetData.targetValues[mKey] = { ...currentObj, ...data.config };
        nextRelations[targetName] = targetData;
      } else if (action === 'renameMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        const nextValues = { ...targetData.values };
        nextValues[data.newKey] = nextValues[data.oldKey];
        delete nextValues[data.oldKey];
        targetData.values = nextValues;
        nextRelations[targetName] = targetData;
      } else if (action === 'renameTargetMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = targetData.targetValues || {};
        const nextValues = { ...targetData.targetValues };
        nextValues[data.newKey] = nextValues[data.oldKey];
        delete nextValues[data.oldKey];
        targetData.targetValues = nextValues;
        nextRelations[targetName] = targetData;
      } else if (action === 'removeMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        const nextValues = { ...targetData.values };
        delete nextValues[data.metric];
        targetData.values = nextValues;
        nextRelations[targetName] = targetData;
      } else if (action === 'removeTargetMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = targetData.targetValues || {};
        const nextValues = { ...targetData.targetValues };
        delete nextValues[data.metric];
        targetData.targetValues = nextValues;
        nextRelations[targetName] = targetData;
      } else if (action === 'addMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.values = { ...(targetData.values || {}), [data.metric]: { value: 0, type: 'integer' } };
        nextRelations[targetName] = targetData;
      } else if (action === 'addTargetMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = { ...(targetData.targetValues || {}), [data.metric]: { value: 0, type: 'integer' } };
        nextRelations[targetName] = targetData;
      }
      return { ...c, relations: nextRelations };
    }));
  };

  const removeField = (id) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const nextStats = { ...c.stats };
      delete nextStats[id];
      return { 
        ...c, 
        statsSchema: (c.statsSchema || []).filter(s => s.id !== id),
        stats: nextStats
      };
    }));
  };

  const handleMoveStat = (id, direction) => {
    const nextSchema = [...(targetChar.statsSchema || [])];
    const idx = nextSchema.findIndex(s => s.id === id);
    const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= nextSchema.length) return;

    const temp = nextSchema[idx];
    nextSchema[idx] = nextSchema[nextIdx];
    nextSchema[nextIdx] = temp;

    setLocalCharacters(localCharacters.map(c => 
      c.id === charId ? { ...c, statsSchema: nextSchema } : c
    ));
  };

  const handleResetCharacter = () => {
    if (window.confirm("Are you sure you want to reset this character to its default state?")) {
      setLocalCharacters(localCharacters.map(c => {
        if (c.id !== charId) return c;
        const defaultChar = getDefaultCharacters()[0];
        
        if (c.activePlayer) {
          return { ...defaultChar, id: c.id, name: c.name };
        } else {
          return {
            id: c.id,
            name: c.name,
            activePlayer: false,
            activeInjection: true,
            statsSchema: JSON.parse(JSON.stringify(DEFAULT_SCHEMAS)),
            stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
            relations: {},
            featuresData: {
              profile: { Race: '', Height: '', Appearance: '' },
              profileLocks: {},
              profileInjects: {}
            }
          };
        }
      }));
    }
  };

  const handleDeleteCharacter = () => {
    if (localCharacters.length <= 1) {
      alert("At least one character must remain in the list.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this character?")) {
      const newChars = localCharacters.filter(c => c.id !== charId);
      if (updateTrackerData) {
        updateTrackerData({
          ...trackerData,
          characters: newChars
        });
      }
      if (onUpdateCharacters) {
        onUpdateCharacters(newChars);
      }
      onClose();
    }
  };

  const handleExportCharacter = () => {
    const charToExport = localCharacters.find(c => c.id === charId);
    if (!charToExport) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(charToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${charToExport.name}_export.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportCharacter = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData && importedData.id) {
          setLocalCharacters(localCharacters.map(c => 
            c.id === charId ? { ...importedData, id: charId } : c
          ));
        } else {
          alert("Invalid character JSON file.");
        }
      } catch (error) {
        alert("Error parsing JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset input
  };

  const handleSaveChanges = () => {
    if (updateTrackerData) {
      // 실존 캐릭터 간의 양방향 관계 데이터를 백그라운드에서 동기화해 줍니다.
      const syncedCharacters = JSON.parse(JSON.stringify(localCharacters));
      
      syncedCharacters.forEach(char => {
        if (!char.relations) return;
        
        Object.entries(char.relations).forEach(([targetName, rData]) => {
          // targetName이 실존하는 캐릭터 카드인지 검사
          const targetChar = syncedCharacters.find(c => c.name?.trim().toLowerCase() === targetName.trim().toLowerCase());
          
          if (targetChar) {
            // CharA 가 가진 CharB를 향한 targetText/targetValues 가 존재한다면, 
            // 실존하는 CharB의 relations["CharA"] 에 덮어씌워 동기화해 줍니다.
            targetChar.relations = targetChar.relations || {};
            
            // 상대방 카드에 주인공을 향한 관계 데이터가 없을 경우 초기화해서 추가해 줌
            if (!targetChar.relations[char.name]) {
              targetChar.relations[char.name] = { text: '', isLocked: false, isInject: true, values: {} };
            }
            
            const targetRel = targetChar.relations[char.name];
            
            // CharA의 targetText가 정의되어 있다면 CharB의 text로 동기화
            if (rData.targetText !== undefined) {
              targetRel.text = rData.targetText;
            }
            
            // CharA의 targetValues가 정의되어 있다면 CharB의 values로 동기화
            if (rData.targetValues) {
              targetRel.values = targetRel.values || {};
              Object.entries(rData.targetValues).forEach(([mName, mVal]) => {
                const mValue = typeof mVal === 'object' && mVal !== null ? mVal.value : mVal;
                const mType = typeof mVal === 'object' && mVal !== null ? mVal.type : 'integer';
                
                if (targetRel.values[mName]) {
                  if (typeof targetRel.values[mName] === 'object' && targetRel.values[mName] !== null) {
                    targetRel.values[mName].value = mValue;
                  } else {
                    targetRel.values[mName] = { value: mValue, type: mType };
                  }
                } else {
                  targetRel.values[mName] = { value: mValue, type: mType };
                }
              });
            }
          }
        });
      });

      updateTrackerData({
        ...trackerData,
        characters: syncedCharacters
      });
      alert("Character configuration saved successfully.");
      onClose();
    }
  };

  const toggleAccordion = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMoveProfile = (key, direction) => {
    const prof = { ...(targetChar.featuresData?.profile || {}) };
    const keys = Object.keys(prof);
    const idx = keys.indexOf(key);
    const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= keys.length) return;
    
    const temp = keys[idx];
    keys[idx] = keys[nextIdx];
    keys[nextIdx] = temp;
    
    const newProf = {};
    keys.forEach(k => {
      newProf[k] = prof[k];
    });
    handleUpdateNestedField('profile', null, newProf);
  };

  const groupedStats = getGroupedFields(targetSchema);
  const profileKeys = targetChar.featuresData?.profile ? Object.keys(targetChar.featuresData.profile) : ['race', 'height', 'hair', 'eye', 'personality'];

  return (
    <div className={styles.editorOverlay}>
      <div className={styles.editorModal} onClick={(e) => e.stopPropagation()}>
        
        <header className={styles.editorHeader}>
          <div className={styles.headerNav}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', opacity: 0.8 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <input 
              type="text" 
              value={targetChar.name} 
              onChange={e => {
                setLocalCharacters(localCharacters.map(c => 
                  c.id === charId ? { ...c, name: e.target.value } : c
                ));
              }}
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '16px', fontWeight: 'bold', outline: 'none', padding: '4px 8px', borderRadius: '4px' }}
            />
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>

        <div className={styles.editorTabs}>
          <button 
            type="button" 
            className={`${styles.tabBtn} ${activeTab === 'status' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
          <button 
            type="button" 
            className={`${styles.tabBtn} ${activeTab === 'relations' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('relations')}
          >
            Relations
          </button>
          <button 
            type="button" 
            className={`${styles.tabBtn} ${activeTab === 'inventory' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            Inventory
          </button>
        </div>

        <div className={styles.editorBody}>
          {activeTab === 'status' && (
          <div className={styles.statEditorDetail}>
            
            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeaderLine}>
                <h5>Consumables & Stackings</h5>
                <button className={styles.addQuickFieldBtn} onClick={() => handleAddStat('consumable')}>+ Add Gauge</button>
              </div>
              {groupedStats.gauge.length === 0 ? (
                <p className={styles.emptySectionText}>No gauge fields defined.</p>
              ) : (
                groupedStats.gauge.map((item, fIdx) => (
                  <div key={item.id} className={`${styles.schemaItem} ${expandedIds[item.id] ? styles.itemExpanded : ''}`}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <button type="button" className={`${styles.accordionToggleBtn} ${expandedIds[item.id] ? styles.activeToggle : ''}`} onClick={() => toggleAccordion(item.id)}>▶</button>
                        <input type="text" value={item.name} onChange={e => updateSchemaField(item.id, 'name', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
                        <span className={styles.fixedBadge}>{item.type.toUpperCase()}</span>
                      </div>
                      <div className={styles.headerRightZone}>
                        <label className={styles.switchRow} title="Toggle Prompt Injection">
                          <span>Inject</span>
                          <div className={styles.switchLabel}>
                            <input type="checkbox" className={styles.switchInput} checked={item.isInject !== false} onChange={e => updateSchemaField(item.id, 'isInject', e.target.checked)} />
                            <span className={styles.switchSlider}></span>
                          </div>
                        </label>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === 0} onClick={() => handleMoveStat(item.id, 'up')}>▲</button>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStats.gauge.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
                        <button type="button" className={styles.removeInlineBtn} onClick={() => removeField(item.id)}>X</button>
                      </div>
                    </div>
                    {expandedIds[item.id] && (
                      <div className={styles.itemFields}>
                        <div className={styles.inlineRow}>
                          <label>Type</label>
                          <select value={item.type} onChange={e => updateSchemaField(item.id, 'type', e.target.value)}>
                            <option value="consumable">Consumable (Max ➔ 0)</option>
                            <option value="stacking">Stacking (0 ➔ Max)</option>
                          </select>
                        </div>
                        <div className={styles.inlineRow}>
                          <label>Min Limit</label>
                          <input type="number" value={item.min !== undefined && item.min !== null ? item.min : 0} onChange={e => updateSchemaField(item.id, 'min', Number(e.target.value))} />
                        </div>
                        <div className={styles.inlineRow}>
                          <label>Max Limit</label>
                          <input type="number" value={item.max || 100} onChange={e => updateSchemaField(item.id, 'max', Number(e.target.value))} />
                        </div>
                        <div className={styles.inlineRow}>
                          <label>Visual Color</label>
                          <input type="color" value={item.color || '#3498db'} onChange={e => updateSchemaField(item.id, 'color', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeaderLine}>
                <h5>Integer</h5>
                <button className={styles.addQuickFieldBtn} onClick={() => handleAddStat('integer')}>+ Add Integer</button>
              </div>
              {groupedStats.integer.length === 0 ? (
                <p className={styles.emptySectionText}>No integer fields defined.</p>
              ) : (
                groupedStats.integer.map((item, fIdx) => (
                  <div key={item.id} className={`${styles.schemaItem} ${expandedIds[item.id] ? styles.itemExpanded : ''}`}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <button type="button" className={`${styles.accordionToggleBtn} ${expandedIds[item.id] ? styles.activeToggle : ''}`} onClick={() => toggleAccordion(item.id)}>▶</button>
                        <input type="text" value={item.name} placeholder="Field Name" onChange={e => updateSchemaField(item.id, 'name', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
                        <span className={styles.fixedBadge}>INT</span>
                      </div>
                      <div className={styles.headerRightZone}>
                        <label className={styles.switchRow} title="Toggle Prompt Injection">
                          <span>Inject</span>
                          <div className={styles.switchLabel}>
                            <input type="checkbox" className={styles.switchInput} checked={item.isInject !== false} onChange={e => updateSchemaField(item.id, 'isInject', e.target.checked)} />
                            <span className={styles.switchSlider}></span>
                          </div>
                        </label>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === 0} onClick={() => handleMoveStat(item.id, 'up')}>▲</button>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStats.integer.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
                        <button type="button" className={styles.removeInlineBtn} onClick={() => removeField(item.id)}>X</button>
                      </div>
                    </div>
                    {expandedIds[item.id] && (
                      <div className={styles.itemFields}>
                        <div className={styles.inlineRow}>
                          <label>Min Limit</label>
                          <input type="number" value={item.min !== undefined && item.min !== null ? item.min : 0} onChange={e => updateSchemaField(item.id, 'min', Number(e.target.value))} />
                        </div>
                        <div className={styles.inlineRow}>
                          <label>Max Limit</label>
                          <input type="number" value={item.max !== undefined && item.max !== null ? item.max : 100} onChange={e => updateSchemaField(item.id, 'max', Number(e.target.value))} />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeaderLine}>
                <h5>Text</h5>
                <button className={styles.addQuickFieldBtn} onClick={() => handleAddStat('text')}>+ Add Text</button>
              </div>
              {groupedStats.text.length === 0 ? (
                <p className={styles.emptySectionText}>No custom text fields defined.</p>
              ) : (
                groupedStats.text.map((item, fIdx) => (
                  <div key={item.id} className={styles.schemaItem}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <input type="text" value={item.name} placeholder="Field Name" onChange={e => updateSchemaField(item.id, 'name', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
                        <span className={styles.fixedBadge}>TEXT</span>
                      </div>
                      <div className={styles.headerRightZone}>
                        <label className={styles.switchRow} title="Toggle Prompt Injection">
                          <span>Inject</span>
                          <div className={styles.switchLabel}>
                            <input type="checkbox" className={styles.switchInput} checked={item.isInject !== false} onChange={e => updateSchemaField(item.id, 'isInject', e.target.checked)} />
                            <span className={styles.switchSlider}></span>
                          </div>
                        </label>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === 0} onClick={() => handleMoveStat(item.id, 'up')}>▲</button>
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStats.text.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
                        <button type="button" className={styles.removeInlineBtn} onClick={() => removeField(item.id)}>X</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={styles.sectionWrapper}>
              <div className={styles.sectionHeaderLine}>
                <h5>Profile</h5>
                <button 
                  className={styles.addQuickFieldBtn} 
                  onClick={() => {
                    const newKey = `New_Field_${Date.now()}`;
                    handleUpdateNestedField('profile', newKey, '');
                  }}
                >
                  + Add Field
                </button>
              </div>
              <div className={styles.appearanceSection}>
                {profileKeys.length === 0 ? (
                  <p className={styles.emptySectionText}>No profile fields defined.</p>
                ) : (
                  profileKeys.map((key, fIdx) => (
                    <div key={key} className={styles.schemaItem}>
                      <div className={styles.itemHeader}>
                        <div className={styles.headerLeftZone}>
                          <input 
                            type="text" 
                            defaultValue={key} 
                            placeholder="Field Name"
                            onBlur={e => {
                              const newKey = e.target.value.trim();
                              if (newKey && newKey !== key && !targetChar.featuresData?.profile?.[newKey]) {
                                const prof = { ...(targetChar.featuresData?.profile || {}) };
                                const pLocks = { ...(targetChar.featuresData?.profileLocks || {}) };
                                const pInjects = { ...(targetChar.featuresData?.profileInjects || {}) };
                                
                                const keys = Object.keys(prof);
                                const newProf = {};
                                const newLocks = {};
                                const newInjects = {};
                                
                                  keys.forEach(k => {
                                    if (k === key) {
                                      newProf[newKey] = prof[key];
                                      newLocks[newKey] = pLocks[key];
                                      newInjects[newKey] = pInjects[key];
                                    } else {
                                      newProf[k] = prof[k];
                                      newLocks[k] = pLocks[k];
                                      newInjects[k] = pInjects[k];
                                    }
                                  });
                                
                                setLocalCharacters(localCharacters.map(c => {
                                  if (c.id !== charId) return c;
                                  return {
                                    ...c,
                                    featuresData: {
                                      ...c.featuresData,
                                      profile: newProf,
                                      profileLocks: newLocks,
                                      profileInjects: newInjects
                                    }
                                  };
                                }));
                              }
                            }}
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }}
                          />
                          <span className={styles.fixedBadge}>TEXT</span>
                        </div>
                        <div className={styles.headerRightZone}>
                          <label className={styles.switchRow} title="Toggle Prompt Injection">
                            <span>Inject</span>
                            <div className={styles.switchLabel}>
                              <input 
                                type="checkbox" 
                                className={styles.switchInput} 
                                checked={targetChar.featuresData?.profileInjects?.[key] !== false} 
                                onChange={e => {
                                  const injects = { ...(targetChar.featuresData?.profileInjects || {}) };
                                  injects[key] = e.target.checked;
                                  handleUpdateNestedField('profileInjects', null, injects);
                                }} 
                              />
                              <span className={styles.switchSlider}></span>
                            </div>
                          </label>
                          <button type="button" className={styles.sortBtn} disabled={fIdx === 0} onClick={() => handleMoveProfile(key, 'up')}>▲</button>
                          <button type="button" className={styles.sortBtn} disabled={fIdx === profileKeys.length - 1} onClick={() => handleMoveProfile(key, 'down')}>▼</button>
                          <button 
                            type="button" 
                            className={styles.removeInlineBtn} 
                            onClick={() => {
                              const prof = { ...(targetChar.featuresData?.profile || {}) };
                              const pLocks = { ...(targetChar.featuresData?.profileLocks || {}) };
                              const pInjects = { ...(targetChar.featuresData?.profileInjects || {}) };
                              delete prof[key];
                              delete pLocks[key];
                              delete pInjects[key];
                              setLocalCharacters(localCharacters.map(c => {
                                if (c.id !== charId) return c;
                                return { ...c, featuresData: { ...c.featuresData, profile: prof, profileLocks: pLocks, profileInjects: pInjects } };
                              }));
                            }}
                          >
                            X
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
          )}

          {activeTab === 'relations' && (
            <div className={styles.relationsTabBody}>
              <div className={styles.tabHeaderRow}>
                <span>Relations Schema & Values</span>
                <button className={styles.addQuickFieldBtn} onClick={() => {
                  const name = `New_Target_${Date.now()}`;
                  handleUpdateRelations(name, 'add');
                }}>+ Add Target</button>
              </div>
              
              {Object.keys(targetChar.relations || {}).length === 0 ? (
                <p className={styles.emptySectionText}>No relations recorded.</p>
              ) : (
                Object.entries(targetChar.relations || {}).map(([targetName, data]) => {
                  const existingCharNames = localCharacters.map(c => c.name?.trim().toLowerCase());
                  const isRealCharacter = existingCharNames.includes(targetName?.trim().toLowerCase());

                  return (
                    <div key={targetName} className={styles.relationCard}>
                      <div className={styles.relationCardHeader}>
                        <input 
                          type="text" 
                          defaultValue={targetName} 
                          onBlur={e => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== targetName && !(targetChar.relations || {})[newName]) {
                              const nextRelations = { ...(targetChar.relations || {}) };
                              nextRelations[newName] = nextRelations[targetName];
                              delete nextRelations[targetName];
                              setLocalCharacters(localCharacters.map(c => 
                                c.id === charId ? { ...c, relations: nextRelations } : c
                              ));
                            }
                          }}
                          style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', padding: '5px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', outline: 'none', marginRight: '10px' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isRealCharacter && (
                            <span style={{ fontSize: '10px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', padding: '2px 6px', borderRadius: '3px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                              Real Character (Synced)
                            </span>
                          )}
                          <label className={styles.switchRow} title="Toggle Prompt Injection">
                            <span>Inject</span>
                            <div className={styles.switchLabel}>
                              <input 
                                type="checkbox" 
                                className={styles.switchInput} 
                                checked={data.isInject !== false} 
                                onChange={e => {
                                  const nextRelations = { ...(targetChar.relations || {}) };
                                  nextRelations[targetName] = { ...data, isInject: e.target.checked };
                                  setLocalCharacters(localCharacters.map(c => 
                                    c.id === charId ? { ...c, relations: nextRelations } : c
                                  ));
                                }} 
                              />
                              <span className={styles.switchSlider}></span>
                            </div>
                          </label>
                          <button type="button" className={styles.removeInlineBtn} onClick={() => {
                            handleUpdateRelations(targetName, 'remove');
                          }}>X</button>
                        </div>
                      </div>

                      {/* --- Outgoing: 주인공 -> 상대방 --- */}
                      <div style={{ padding: '8px', borderLeft: '3px solid var(--rpg-highlight)', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-highlight)', display: 'block', marginBottom: '6px' }}>
                          My Status ➔ {targetName}
                        </span>
                        
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', opacity: 0.6, display: 'block', marginBottom: '2px' }}>Description (My Thoughts)</span>
                          <textarea 
                            value={data.text || ''} 
                            placeholder={`How ${targetChar.name} feels about ${targetName}...`}
                            onChange={e => handleUpdateRelations(targetName, 'updateField', { field: 'text', value: e.target.value })}
                            style={{ width: '100%', minHeight: '50px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '6px', fontSize: '11px', resize: 'vertical', outline: 'none' }}
                          />
                        </div>

                        {/* Outgoing Metrics */}
                        {Object.entries(data.values || {}).map(([mName, mVal]) => {
                          const isObj = typeof mVal === 'object' && mVal !== null;
                          const mType = isObj ? mVal.type : 'integer';
                          const mMin = isObj && mVal.min !== undefined ? mVal.min : 0;
                          const mMax = isObj ? mVal.max : 100;
                          const mRealValue = isObj ? mVal.value : mVal;

                          return (
                            <div key={mName} className={styles.relationInputRow} style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                              <input 
                                type="text" 
                                defaultValue={mName} 
                                onBlur={e => {
                                  if (e.target.value && e.target.value !== mName && !(data.values || {})[e.target.value]) {
                                    handleUpdateRelations(targetName, 'renameMetric', { oldKey: mName, newKey: e.target.value });
                                  }
                                }}
                                style={{ flex: 1, minWidth: '80px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                              />
                              <select 
                                value={mType}
                                onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { type: e.target.value } })}
                                style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', outline: 'none', padding: '4px' }}
                              >
                                <option value="integer">Integer</option>
                                <option value="stacking">Stacking</option>
                              </select>
                              {['integer', 'stacking'].includes(mType) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>Min:</span>
                                    <input 
                                      type="number" 
                                      value={mMin !== undefined && mMin !== null ? mMin : 0}
                                      onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { min: Number(e.target.value) } })}
                                      style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>Max:</span>
                                    <input 
                                      type="number" 
                                      value={mMax !== undefined && mMax !== null ? mMax : 100}
                                      onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { max: Number(e.target.value) } })}
                                      style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                    />
                                  </div>
                                </div>
                              )}
                              <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'removeMetric', { metric: mName })}>X</button>
                            </div>
                          );
                        })}
                        
                        <button className={styles.addQuickFieldBtn} style={{ alignSelf: 'flex-start', marginTop: '6px' }} onClick={() => {
                          const mName = `New_Metric_${Date.now()}`;
                          handleUpdateRelations(targetName, 'addMetric', { metric: mName });
                        }}>+ Add Metric</button>
                      </div>

                      {/* --- Incoming: 상대방 -> 주인공 (쌍방 데이터) --- */}
                      <div style={{ padding: '8px', borderLeft: '3px solid var(--rpg-highlight)', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-highlight)', display: 'block', marginBottom: '6px' }}>
                          {targetName} ➔ My Status
                        </span>
                        
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', opacity: 0.6, display: 'block', marginBottom: '2px' }}>Target Description (Their Thoughts)</span>
                          <textarea 
                            value={data.targetText || ''} 
                            placeholder={`How ${targetName} feels about ${targetChar.name}...`}
                            onChange={e => handleUpdateRelations(targetName, 'updateField', { field: 'targetText', value: e.target.value })}
                            style={{ width: '100%', minHeight: '50px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '6px', fontSize: '11px', resize: 'vertical', outline: 'none' }}
                          />
                        </div>

                        {/* Incoming Metrics */}
                        {Object.entries(data.targetValues || {}).map(([tmName, tmVal]) => {
                          const isObj = typeof tmVal === 'object' && tmVal !== null;
                          const tmType = isObj ? tmVal.type : 'integer';
                          const tmMin = isObj && tmVal.min !== undefined ? tmVal.min : 0;
                          const tmMax = isObj ? tmVal.max : 100;

                          return (
                            <div key={tmName} className={styles.relationInputRow} style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                              <input 
                                type="text" 
                                defaultValue={tmName} 
                                onBlur={e => {
                                  if (e.target.value && e.target.value !== tmName && !(data.targetValues || {})[e.target.value]) {
                                    handleUpdateRelations(targetName, 'renameTargetMetric', { oldKey: tmName, newKey: e.target.value });
                                  }
                                }}
                                style={{ flex: 1, minWidth: '80px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                              />
                              <select 
                                value={tmType}
                                onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { type: e.target.value } })}
                                style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', outline: 'none', padding: '4px' }}
                              >
                                <option value="integer">Integer</option>
                                <option value="stacking">Stacking</option>
                              </select>
                              {['integer', 'stacking'].includes(tmType) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>Min:</span>
                                    <input 
                                      type="number" 
                                      value={tmMin !== undefined && tmMin !== null ? tmMin : 0}
                                      onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { min: Number(e.target.value) } })}
                                      style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>Max:</span>
                                    <input 
                                      type="number" 
                                      value={tmMax !== undefined && tmMax !== null ? tmMax : 100}
                                      onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { max: Number(e.target.value) } })}
                                      style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                    />
                                  </div>
                                </div>
                              )}
                              <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'removeTargetMetric', { metric: tmName })}>X</button>
                            </div>
                          );
                        })}
                        
                        <button className={styles.addQuickFieldBtn} style={{ alignSelf: 'flex-start', marginTop: '6px' }} onClick={() => {
                          const mName = `New_Metric_${Date.now()}`;
                          handleUpdateRelations(targetName, 'addTargetMetric', { metric: mName });
                        }}>+ Add Metric</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className={styles.inventoryTabBody}>
              <div className={styles.invActionBar}>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const name = `New_Slot_${Date.now()}`;
                  const equip = { ...(targetChar.featuresData?.inventory?.equipment || {}) };
                  equip[name] = null;
                  handleUpdateNestedField('inventory', 'equipment', equip);
                }}>+ Add Slot</button>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const name = `New_Container_${Date.now()}`;
                  const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                  storage[name] = [];
                  handleUpdateNestedField('inventory', 'storage', storage);
                }}>+ Add Container</button>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                  const storageKeys = Object.keys(storage);
                  let targetKey = storageKeys[0] || 'backpack';
                  if (!storage[targetKey]) storage[targetKey] = [];
                  
                  storage[targetKey] = [
                    { id: `item_${Date.now()}`, name: '', desc: '', quantity: 1, isNew: true },
                    ...storage[targetKey]
                  ];
                  handleUpdateNestedField('inventory', 'storage', storage);
                }}>+ Add Item</button>
              </div>

              <div className={styles.invSection}>
                <h5 className={styles.invSectionTitle}>Equipment Slots</h5>
                <div className={styles.invEquipGrid}>
                  {Object.entries(targetChar.featuresData?.inventory?.equipment || {}).map(([slotKey, item]) => (
                    <div 
                      key={slotKey} 
                      className={styles.invSlotCard}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(e, 'equipment', slotKey)}
                    >
                      <div className={styles.slotHeader}>
                        <input 
                          type="text" 
                          className={styles.slotRenameInput} 
                          defaultValue={slotKey}
                          onBlur={e => {
                            const newKey = e.target.value.trim();
                            if (newKey && newKey !== slotKey && !(targetChar.featuresData?.inventory?.equipment || {})[newKey]) {
                              const equip = { ...(targetChar.featuresData?.inventory?.equipment || {}) };
                              equip[newKey] = equip[slotKey];
                              delete equip[slotKey];
                              handleUpdateNestedField('inventory', 'equipment', equip);
                            }
                          }}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '4px 8px', borderRadius: '4px' }}
                        />
                        <button type="button" className={styles.removeInlineBtn} onClick={() => {
                          const equip = { ...(targetChar.featuresData?.inventory?.equipment || {}) };
                          delete equip[slotKey];
                          handleUpdateNestedField('inventory', 'equipment', equip);
                        }}>X</button>
                      </div>

                      {item ? (
                        <div 
                          className={styles.equippedItem}
                          draggable
                          onDragStart={e => handleDragStart(e, 'equipment', slotKey, null, item)}
                        >
                          <div className={styles.itemText}>
                            <span className={styles.name}>{item.name || '(No Name)'}</span>
                            <span className={styles.desc}>{item.desc || '(No Description)'}</span>
                          </div>
                          <button type="button" className={styles.unequipBtn} onClick={() => {
                            const equip = { ...(targetChar.featuresData?.inventory?.equipment || {}) };
                            equip[slotKey] = null;
                            const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                            const firstStore = Object.keys(storage)[0] || 'backpack';
                            if (!storage[firstStore]) storage[firstStore] = [];
                            storage[firstStore].push(item);
                            handleUpdateNestedField('inventory', null, { equipment: equip, storage });
                          }}>Unequip</button>
                        </div>
                      ) : (
                        <span className={styles.emptyText}>Empty</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.invSection}>
                <h5 className={styles.invSectionTitle}>Containers & Items</h5>
                <div className={styles.invStorageGrid}>
                  {Object.entries(targetChar.featuresData?.inventory?.storage || {}).map(([storageKey, items]) => {
                    const itemList = Array.isArray(items) ? items : [];
                    return (
                      <div 
                        key={storageKey} 
                        className={styles.invStorageBox}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleDrop(e, 'storage', storageKey)}
                      >
                        <div className={styles.slotHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '70%' }}>
                            <button 
                              type="button" 
                              className={`${styles.accordionToggleBtn} ${expandedIds[`storage_${storageKey}`] !== false ? styles.activeToggle : ''}`} 
                              onClick={() => setExpandedIds(prev => ({ ...prev, [`storage_${storageKey}`]: prev[`storage_${storageKey}`] === false ? true : false }))}
                            >
                              ▶
                            </button>
                            <input 
                              type="text" 
                              className={styles.slotRenameInput} 
                              defaultValue={storageKey}
                              onBlur={e => {
                                const newKey = e.target.value.trim();
                                if (newKey && newKey !== storageKey && !(targetChar.featuresData?.inventory?.storage || {})[newKey]) {
                                  const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                                  storage[newKey] = storage[storageKey];
                                  delete storage[storageKey];
                                  handleUpdateNestedField('inventory', 'storage', storage);
                                }
                              }}
                              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '4px 8px', borderRadius: '4px' }}
                            />
                          </div>
                          <button type="button" className={styles.removeInlineBtn} onClick={() => {
                            const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                            delete storage[storageKey];
                            handleUpdateNestedField('inventory', 'storage', storage);
                          }}>X</button>
                        </div>

                        {expandedIds[`storage_${storageKey}`] !== false && (
                        <div className={styles.invStorageItemsList}>
                          {itemList.length === 0 ? (
                            <span className={styles.emptyText}>Empty container</span>
                          ) : (
                            itemList.map((item, idx) => (
                              <div 
                                key={item.id || idx} 
                                className={styles.invItemRow}
                                draggable
                                onDragStart={e => handleDragStart(e, 'storage', storageKey, idx, item)}
                              >
                                <div style={{ width: '100%' }}>
                                  <div className={styles.itemTitleLine}>
                                    <input 
                                      type="text" 
                                      className={styles.itemTitleInput} 
                                      value={item.name} 
                                      placeholder="Item name..."
                                      onChange={e => {
                                        const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                                        storage[storageKey][idx].name = e.target.value;
                                        handleUpdateNestedField('inventory', 'storage', storage);
                                      }}
                                    />
                                    <div className={styles.itemQtyBox}>
                                      <span>[</span>
                                      <input 
                                        type="number" 
                                        className={styles.itemQtyInput} 
                                        value={item.quantity || 1} 
                                        onChange={e => {
                                          const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                                          storage[storageKey][idx].quantity = Number(e.target.value);
                                          handleUpdateNestedField('inventory', 'storage', storage);
                                        }}
                                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '2px 4px', borderRadius: '4px', width: '40px', textAlign: 'center' }}
                                      />
                                      <span>]</span>
                                    </div>
                                    <button type="button" className={styles.itemDeleteBtn} onClick={() => {
                                      const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                                      storage[storageKey].splice(idx, 1);
                                      handleUpdateNestedField('inventory', 'storage', storage);
                                    }}>×</button>
                                  </div>
                                  <input 
                                    type="text" 
                                    className={styles.itemDescInput} 
                                    value={item.desc} 
                                    placeholder="Description..."
                                    onChange={e => {
                                      const storage = { ...(targetChar.featuresData?.inventory?.storage || {}) };
                                      storage[storageKey][idx].desc = e.target.value;
                                      handleUpdateNestedField('inventory', 'storage', storage);
                                    }}
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.editorFooter}>
          <div className={styles.footerLeft}>
            <button className={`${styles.footerBtn} ${styles.reset}`} onClick={handleResetCharacter}>Reset</button>
            <button className={`${styles.footerBtn} ${styles.reset}`} style={{ marginLeft: '6px' }} onClick={handleDeleteCharacter}>Delete</button>
          </div>
          <div className={styles.footerRight}>
            <button className={styles.footerBtn} onClick={handleExportCharacter}>Export</button>
            <label className={styles.footerBtn} style={{ cursor: 'pointer', margin: '0 6px' }}>
              Import
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportCharacter} />
            </label>
            <button className={`${styles.footerBtn} ${styles.save}`} onClick={handleSaveChanges}>Save</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
