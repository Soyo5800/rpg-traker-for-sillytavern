// src/tracker/StatusEditor.jsx
import React, { useState, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './StatusEditor.module.css';
import { sanitizeTrackerData } from '../core/JSONTracker';

import { DEFAULT_STATUS_SCHEMAS, DEFAULT_STATUS, getDefaultCharacters } from '../core/PromptSchema';

// StatusEditor component: Acts as a Roster creation button and as a specification editor modal taking individual character ID
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

  // --- Presets for convenient schema field creation ---
  const [gaugePreset, setGaugePreset] = useState('0~100');
  const [gaugeMin, setGaugeMin] = useState(0);
  const [gaugeMax, setGaugeMax] = useState(100);

  const [integerPreset, setIntegerPreset] = useState('0~100');
  const [integerMin, setIntegerMin] = useState(0);
  const [integerMax, setIntegerMax] = useState(100);

  const [relationPreset, setRelationPreset] = useState('-100~100');
  const [relationMin, setRelationMin] = useState(-100);
  const [relationMax, setRelationMax] = useState(100);

  const handleDragStart = (e, loc, key, index, item) => {
    setDragItem({ loc, key, index, item });
  };

  const handleDrop = (e, destLoc, destKey, destIdx = null) => {
    e.preventDefault();
    if (!dragItem) return;

    const targetChar = localCharacters.find(c => c.id === charId);
    if (!targetChar) return;

    const nextEquip = { ...(targetChar.inventory?.equipment || {}) };
    const nextStorage = { ...(targetChar.inventory?.storage || {}) };

    let itemToMove = dragItem.item;
    if (dragItem.loc === 'equipment') {
      nextEquip[dragItem.key] = null;
    } else {
      const srcList = [...(nextStorage[dragItem.key] || [])];
      const [removed] = srcList.splice(dragItem.index, 1);
      if (removed) itemToMove = removed;
      nextStorage[dragItem.key] = srcList;
    }

    if (destLoc === 'equipment') {
      const displaced = nextEquip[destKey];
      nextEquip[destKey] = itemToMove;
      if (displaced) {
        const firstStore = Object.keys(nextStorage)[0] || 'backpack';
        if (!nextStorage[firstStore]) nextStorage[firstStore] = [];
        nextStorage[firstStore].push(displaced);
      }
    } else {
      if (!nextStorage[destKey]) nextStorage[destKey] = [];
      let destList = [...(nextStorage[destKey] || [])];
      if (destIdx !== null && destIdx !== undefined) {
        destList.splice(destIdx, 0, itemToMove);
      } else {
        destList.push(itemToMove);
      }
      nextStorage[destKey] = destList;
    }

    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      return {
        ...c,
        inventory: {
          ...(c.inventory || {}),
          equipment: nextEquip,
          storage: nextStorage
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

  // --- Roster Add Button Feature (when charId is absent) ---
  const handleAddCharacter = () => {
    const name = "New Character";

    const newChar = {
      id: `char_${Date.now()}`,
      name: name,
      activePlayer: false,
      activeInjection: true,
      statusSchema: JSON.parse(JSON.stringify(DEFAULT_STATUS_SCHEMAS)),
      status: { ...DEFAULT_STATUS },
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

  // --- Spec Editor Modal Feature (when charId exists) ---
  const targetChar = localCharacters.find(c => c.id === charId);

  if (!targetChar) {
    return null;
  }

  const targetSchema = (targetChar.statusSchema || []).filter(s => s.type !== 'relation_schema');

  const getGroupedFields = (schema) => ({
    gauge: schema.filter(item => ['stacking', 'consumable'].includes(item.type)),
    integer: schema.filter(item => item.type === 'integer'),
    text: schema.filter(item => item.type === 'text')
  });

  const handleAddStat = (type, customMin = 0, customMax = 100) => {
    const targetChar = localCharacters.find(c => c.id === charId);
    const existingIds = (targetChar?.statusSchema || []).map(s => s.id);
    
    let baseName = 'NewField';
    let statId = baseName;
    let counter = 1;
    while (existingIds.includes(statId)) {
      statId = `${baseName}_${counter}`;
      counter++;
    }

    const newField = { 
      id: statId, 
      name: statId === baseName ? 'NewField' : `NewField ${counter - 1}`, 
      type, 
      min: type !== 'text' ? customMin : null,
      max: type !== 'text' ? customMax : null,
      color: type === 'stacking' ? '#3498db' : (type === 'consumable' ? '#e74c3c' : undefined),
      isLocked: false,
      isInject: true
    };
    setLocalCharacters(localCharacters.map(c => 
      c.id === charId 
        ? { 
            ...c, 
            statusSchema: [...(c.statusSchema || []), newField], 
            status: { ...c.status, [statId]: type === 'text' ? '' : 0 } 
          } 
        : c
    ));
    setExpandedIds(prev => ({ ...prev, [statId]: true }));
  };

  const handleSchemaNameBlur = (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    // cleanId generation rule (identical to the sanitizeTrackerData regex in JSONTracker.js)
    const cleanId = trimmed.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    const newId = cleanId || `NewField_${Date.now()}`;

    setLocalCharacters(prevChars => prevChars.map(c => {
      if (c.id !== charId) return c;

      // If this ID is already used by another schema field, do not migrate (only update name)
      const otherExists = (c.statusSchema || []).some(s => s.id === newId && s.id !== id);
      if (otherExists) {
        alert(`The status field name "${trimmed}" already exists. Duplicate names are not allowed.`);
        return {
          ...c,
          statusSchema: (c.statusSchema || []).map(s => s.id === id ? { ...s, name: id } : s)
        };
      }

      const nextSchema = (c.statusSchema || []).map(s => {
        if (s.id === id) {
          return { ...s, id: newId, name: trimmed };
        }
        return s;
      });

      const nextStatus = {};
      Object.entries(c.status || {}).forEach(([k, v]) => {
        if (k === id) {
          nextStatus[newId] = v;
        } else {
          nextStatus[k] = v;
        }
      });

      return {
        ...c,
        statusSchema: nextSchema,
        status: nextStatus
      };
    }));

    if (id !== newId) {
      setExpandedIds(prev => {
        const next = { ...prev };
        if (next[id] !== undefined) {
          next[newId] = next[id];
          delete next[id];
        }
        return next;
      });
    }
  };

  const updateSchemaField = (id, key, val) => {
    setLocalCharacters(localCharacters.map(c => 
      c.id === charId 
        ? { ...c, statusSchema: (c.statusSchema || []).map(s => s.id === id ? { ...s, [key]: val } : s) } 
        : c
    ));
  };

  const handleUpdateNestedField = (group, key, val) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const currentGroup = c[group] || {};
      return {
        ...c,
        [group]: key === null ? val : { ...currentGroup, [key]: val }
      };
    }));
  };

  const handleUpdateRelations = (targetName, action, data) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const nextRelations = { ...(c.relations || {}) };
      if (action === 'add') {
        if (!nextRelations[targetName]) {
          nextRelations[targetName] = { text: '', targetText: '', isLocked: false, isInject: true, values: { 'Affection': { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } }, targetValues: {} };
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
            targetData.values[data.field] = { value: data.value, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
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
          targetData.targetValues[data.field] = { value: data.value, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
        }
        nextRelations[targetName] = targetData;
      } else if (action === 'updateMetricConfig') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        const mKey = data.metric;
        const old = targetData.values[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
        targetData.values[mKey] = { ...currentObj, ...data.config };
        nextRelations[targetName] = targetData;
      } else if (action === 'updateTargetMetricConfig') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = targetData.targetValues || {};
        const mKey = data.metric;
        const old = targetData.targetValues[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
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
        targetData.values = { ...(targetData.values || {}), [data.metric]: { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } };
        nextRelations[targetName] = targetData;
      } else if (action === 'addTargetMetric') {
        const targetData = nextRelations[targetName] || { text: '', values: {} };
        targetData.targetValues = { ...(targetData.targetValues || {}), [data.metric]: { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } };
        nextRelations[targetName] = targetData;
      }
      return { ...c, relations: nextRelations };
    }));
  };

  const handleReorderRelation = (targetName, direction) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const relations = c.relations || {};
      const keys = Object.keys(relations);
      const index = keys.indexOf(targetName);
      if (index === -1) return c;
      
      const nextKeys = [...keys];
      if (direction === 'up' && index > 0) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index - 1];
        nextKeys[index - 1] = temp;
      } else if (direction === 'down' && index < keys.length - 1) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index + 1];
        nextKeys[index + 1] = temp;
      } else {
        return c; // No change
      }
      
      const nextRelations = {};
      nextKeys.forEach(k => {
        nextRelations[k] = relations[k];
      });
      return { ...c, relations: nextRelations };
    }));
  };

  const handleReorderEquipmentSlot = (slotKey, direction) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const equip = c.inventory?.equipment || {};
      const keys = Object.keys(equip);
      const index = keys.indexOf(slotKey);
      if (index === -1) return c;

      const nextKeys = [...keys];
      if (direction === 'up' && index > 0) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index - 1];
        nextKeys[index - 1] = temp;
      } else if (direction === 'down' && index < keys.length - 1) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index + 1];
        nextKeys[index + 1] = temp;
      } else {
        return c;
      }

      const nextEquip = {};
      nextKeys.forEach(k => {
        nextEquip[k] = equip[k];
      });

      return {
        ...c,
        inventory: {
          ...(c.inventory || {}),
          equipment: nextEquip
        }
      };
    }));
  };

  const handleReorderInventoryItem = (storageKey, idx, direction) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const storage = { ...(c.inventory?.storage || {}) };
      const items = [...(storage[storageKey] || [])];
      if (idx < 0 || idx >= items.length) return c;

      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= items.length) return c;

      const temp = items[idx];
      items[idx] = items[nextIdx];
      items[nextIdx] = temp;

      storage[storageKey] = items;
      return {
        ...c,
        inventory: {
          ...(c.inventory || {}),
          storage
        }
      };
    }));
  };


  const handleReorderStorage = (storageKey, direction) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const storage = c.inventory?.storage || {};
      const keys = Object.keys(storage);
      const index = keys.indexOf(storageKey);
      if (index === -1) return c;

      const nextKeys = [...keys];
      if (direction === 'up' && index > 0) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index - 1];
        nextKeys[index - 1] = temp;
      } else if (direction === 'down' && index < keys.length - 1) {
        const temp = nextKeys[index];
        nextKeys[index] = nextKeys[index + 1];
        nextKeys[index + 1] = temp;
      } else {
        return c;
      }

      const nextStorage = {};
      nextKeys.forEach(k => {
        nextStorage[k] = storage[k];
      });

      return {
        ...c,
        inventory: {
          ...(c.inventory || {}),
          storage: nextStorage
        }
      };
    }));
  };

  const removeField = (id) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const nextStatus = { ...c.status };
      delete nextStatus[id];
      return { 
        ...c, 
        statusSchema: (c.statusSchema || []).filter(s => s.id !== id),
        status: nextStatus
      };
    }));
  };

  const handleMoveStat = (id, direction) => {
    const nextSchema = [...(targetChar.statusSchema || [])];
    const idx = nextSchema.findIndex(s => s.id === id);
    const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= nextSchema.length) return;

    const temp = nextSchema[idx];
    nextSchema[idx] = nextSchema[nextIdx];
    nextSchema[nextIdx] = temp;

    setLocalCharacters(localCharacters.map(c => 
      c.id === charId ? { ...c, statusSchema: nextSchema } : c
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
            statusSchema: JSON.parse(JSON.stringify(DEFAULT_STATUS_SCHEMAS)),
            status: JSON.parse(JSON.stringify(DEFAULT_STATUS)),
            relations: {},
            profile: { Race: '', Height: '', Appearance: '' },
            profileLocks: {},
            profileInjects: {}
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
            c.id === charId ? { ...(() => {
              const tempTracker = { characters: [importedData] };
              const sanitizedTemp = sanitizeTrackerData(tempTracker);
              return sanitizedTemp.characters[0];
            })(), id: charId } : c
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
      // Synchronize two-way relationship data between real characters in the background.
      // 1. Build temporary trackerData and perform unified migration via sanitizeTrackerData.
      const tempTracker = {
        characters: JSON.parse(JSON.stringify(localCharacters)),
        globalDefinitions: JSON.parse(JSON.stringify(trackerData.globalDefinitions || {}))
      };
      
      const sanitizedTracker = sanitizeTrackerData(tempTracker);
      const syncedCharacters = sanitizedTracker.characters;
      const nextGlobalDefs = sanitizedTracker.globalDefinitions;


      
      syncedCharacters.forEach(char => {
        if (!char.relations) return;
        
        Object.entries(char.relations).forEach(([targetName, rData]) => {
          // Check if targetName is a real character card
          const targetChar = syncedCharacters.find(c => c.name?.trim().toLowerCase() === targetName.trim().toLowerCase());
          
          if (targetChar) {
            // If targetText/targetValues directed towards CharB exists in CharA, 
            // override and sync it to relations["CharA"] of CharB.
            targetChar.relations = targetChar.relations || {};
            
            // Initialize and add relationship data if it doesn't exist on the opponent's card
            if (!targetChar.relations[char.name]) {
              targetChar.relations[char.name] = { text: '', isLocked: false, isInject: true, values: {} };
            }
            
            const targetRel = targetChar.relations[char.name];
            
            // Sync CharA's targetText to CharB's text if defined
            if (rData.targetText !== undefined) {
              targetRel.text = rData.targetText;
            }
            
            // Sync CharA's targetValues to CharB's values if defined
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
        characters: syncedCharacters,
        globalDefinitions: nextGlobalDefs
      });
      alert("Character configuration saved successfully.");
      onClose();
    }
  };

  const toggleAccordion = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMoveProfile = (key, direction) => {
    const prof = { ...(targetChar.profile || {}) };
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

  const groupedStatus = getGroupedFields(targetSchema);
  const profileKeys = targetChar.profile ? Object.keys(targetChar.profile) : ['race', 'height', 'hair', 'eye', 'personality'];

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select 
                    value={gaugePreset} 
                    onChange={e => {
                      setGaugePreset(e.target.value);
                      if (e.target.value !== 'custom') {
                        setGaugeMin(0);
                        setGaugeMax(100);
                      }
                    }}
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option value="0~100">0~100</option>
                    <option value="custom">custom</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>min</span>
                    <input 
                      type="number" 
                      value={gaugeMin} 
                      disabled={gaugePreset !== 'custom'} 
                      onChange={e => setGaugeMin(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>max</span>
                    <input 
                      type="number" 
                      value={gaugeMax} 
                      disabled={gaugePreset !== 'custom'} 
                      onChange={e => setGaugeMax(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                  </div>
                  <button className={styles.addQuickFieldBtn} onClick={() => handleAddStat('consumable', gaugeMin, gaugeMax)}>+Add</button>
                </div>
              </div>
              {groupedStatus.gauge.length === 0 ? (
                <p className={styles.emptySectionText}>No gauge fields defined.</p>
              ) : (
                groupedStatus.gauge.map((item, fIdx) => (
                  <div key={item.id} className={`${styles.schemaItem} ${expandedIds[item.id] ? styles.itemExpanded : ''}`}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <button type="button" className={`${styles.accordionToggleBtn} ${expandedIds[item.id] ? styles.activeToggle : ''}`} onClick={() => toggleAccordion(item.id)}>▶</button>
                        <input type="text" value={item.name} onChange={e => updateSchemaField(item.id, 'name', e.target.value)} onBlur={e => handleSchemaNameBlur(item.id, e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
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
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStatus.gauge.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select 
                    value={integerPreset} 
                    onChange={e => {
                      setIntegerPreset(e.target.value);
                      if (e.target.value === '0~25') {
                        setIntegerMin(0);
                        setIntegerMax(25);
                      } else if (e.target.value === '0~100') {
                        setIntegerMin(0);
                        setIntegerMax(100);
                      }
                    }}
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option value="0~25">0~25</option>
                    <option value="0~100">0~100</option>
                    <option value="custom">custom</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>min</span>
                    <input 
                      type="number" 
                      value={integerMin} 
                      disabled={integerPreset !== 'custom'} 
                      onChange={e => setIntegerMin(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>max</span>
                    <input 
                      type="number" 
                      value={integerMax} 
                      disabled={integerPreset !== 'custom'} 
                      onChange={e => setIntegerMax(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                  </div>
                  <button className={styles.addQuickFieldBtn} onClick={() => handleAddStat('integer', integerMin, integerMax)}>+Add</button>
                </div>
              </div>
              {groupedStatus.integer.length === 0 ? (
                <p className={styles.emptySectionText}>No integer fields defined.</p>
              ) : (
                groupedStatus.integer.map((item, fIdx) => (
                  <div key={item.id} className={`${styles.schemaItem} ${expandedIds[item.id] ? styles.itemExpanded : ''}`}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <button type="button" className={`${styles.accordionToggleBtn} ${expandedIds[item.id] ? styles.activeToggle : ''}`} onClick={() => toggleAccordion(item.id)}>▶</button>
                        <input type="text" value={item.name} placeholder="Field Name" onChange={e => updateSchemaField(item.id, 'name', e.target.value)} onBlur={e => handleSchemaNameBlur(item.id, e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
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
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStatus.integer.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
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
              {groupedStatus.text.length === 0 ? (
                <p className={styles.emptySectionText}>No custom text fields defined.</p>
              ) : (
                groupedStatus.text.map((item, fIdx) => (
                  <div key={item.id} className={styles.schemaItem}>
                    <div className={styles.itemHeader}>
                      <div className={styles.headerLeftZone}>
                        <input type="text" value={item.name} placeholder="Field Name" onChange={e => updateSchemaField(item.id, 'name', e.target.value)} onBlur={e => handleSchemaNameBlur(item.id, e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', width: '100px', padding: '4px 8px', borderRadius: '4px' }} />
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
                        <button type="button" className={styles.sortBtn} disabled={fIdx === groupedStatus.text.length - 1} onClick={() => handleMoveStat(item.id, 'down')}>▼</button>
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
                    const prof = targetChar.profile || {};
                    let baseKey = 'NewField';
                    let newKey = baseKey;
                    let counter = 1;
                    while (prof[newKey] !== undefined) {
                      newKey = `${baseKey}_${counter}`;
                      counter++;
                    }
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
                              if (!newKey) {
                                e.target.value = key;
                                return;
                              }
                              if (newKey !== key && targetChar.profile?.[newKey] !== undefined) {
                                alert(`The profile field name "${newKey}" already exists. Duplicate names are not allowed.`);
                                e.target.value = key;
                                return;
                              }
                              if (newKey !== key) {
                                const prof = { ...(targetChar.profile || {}) };
                                const pLocks = { ...(targetChar.profileLocks || {}) };
                                const pInjects = { ...(targetChar.profileInjects || {}) };
                                
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
                                    profile: newProf,
                                    profileLocks: newLocks,
                                    profileInjects: newInjects
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
                                checked={targetChar.profileInjects?.[key] !== false} 
                                onChange={e => {
                                  const injects = { ...(targetChar.profileInjects || {}) };
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
                              const prof = { ...(targetChar.profile || {}) };
                              const pLocks = { ...(targetChar.profileLocks || {}) };
                              const pInjects = { ...(targetChar.profileInjects || {}) };
                              delete prof[key];
                              delete pLocks[key];
                              delete pInjects[key];
                              setLocalCharacters(localCharacters.map(c => {
                                if (c.id !== charId) return c;
                                return { ...c, profile: prof, profileLocks: pLocks, profileInjects: pInjects };
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select 
                    value={relationPreset} 
                    onChange={e => {
                      setRelationPreset(e.target.value);
                      if (e.target.value === '-100~100') {
                        setRelationMin(-100);
                        setRelationMax(100);
                      }
                    }}
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option value="-100~100">-100~100</option>
                    <option value="custom">custom</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>min</span>
                    <input 
                      type="number" 
                      value={relationMin} 
                      disabled={relationPreset !== 'custom'} 
                      onChange={e => setRelationMin(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>max</span>
                    <input 
                      type="number" 
                      value={relationMax} 
                      disabled={relationPreset !== 'custom'} 
                      onChange={e => setRelationMax(Number(e.target.value))} 
                      style={{ width: '45px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', outline: 'none' }} 
                    />
                  </div>
                  <button className={styles.addQuickFieldBtn} onClick={() => {
                    const existingTargets = Object.keys(targetChar.relations || {});
                    let baseName = 'NewTarget';
                    let name = baseName;
                    let counter = 1;
                    while (existingTargets.includes(name)) {
                      name = `${baseName}_${counter}`;
                      counter++;
                    }
                    handleUpdateRelations(name, 'add');
                  }}>+ Add Target</button>
                </div>
              </div>
              
              {(() => {
                const relationsList = Object.entries(targetChar.relations || {});
                const totalRelations = relationsList.length;
                if (totalRelations === 0) {
                  return <p className={styles.emptySectionText}>No relations recorded.</p>;
                }
                return relationsList.map(([targetName, data], rIdx) => {
                  const isExpanded = expandedIds[`relation_${targetName}`] !== false;

                  const existingCharNames = localCharacters.map(c => c.name?.trim().toLowerCase());
                  const isRealCharacter = existingCharNames.includes(targetName?.trim().toLowerCase());

                  return (
                    <div key={targetName} className={styles.relationCard}>
                      <div className={styles.relationCardHeader}>
                        <button 
                          type="button" 
                          className={`${styles.accordionToggleBtn} ${isExpanded ? styles.activeToggle : ''}`} 
                          onClick={() => setExpandedIds(prev => ({ ...prev, [`relation_${targetName}`]: prev[`relation_${targetName}`] === false ? true : false }))}
                          style={{ marginRight: '6px' }}
                        >
                          ▶
                        </button>
                        <input 
                          type="text" 
                          defaultValue={targetName} 
                          onBlur={e => {
                            const newName = e.target.value.trim();
                            if (!newName) {
                              e.target.value = targetName;
                              return;
                            }
                            if (newName !== targetName && (targetChar.relations || {})[newName] !== undefined) {
                              alert(`The relation target "${newName}" already exists. Duplicate names are not allowed.`);
                              e.target.value = targetName;
                              return;
                            }
                            if (newName !== targetName) {
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
                          <button 
                            type="button" 
                            className={styles.sortBtn} 
                            disabled={rIdx === 0} 
                            onClick={() => handleReorderRelation(targetName, 'up')}
                          >
                            ▲
                          </button>
                          <button 
                            type="button" 
                            className={styles.sortBtn} 
                            disabled={rIdx === totalRelations - 1} 
                            onClick={() => handleReorderRelation(targetName, 'down')}
                          >
                            ▼
                          </button>
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

                      {isExpanded && (
                        <>
                          {/* --- Outgoing: Current -> Target --- */}
                      <div style={{ padding: '8px', borderLeft: '3px solid var(--rpg-text)', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-text)' }}>
                            {targetChar.name} ➔ {targetName}
                          </span>
                          <button className={styles.addQuickFieldBtn} onClick={() => {
                            const existingMetrics = Object.keys(data.values || {});
                            let baseName = 'NewMetric';
                            let mName = baseName;
                            let counter = 1;
                            while (existingMetrics.includes(mName)) {
                              mName = `${baseName}_${counter}`;
                              counter++;
                            }
                            handleUpdateRelations(targetName, 'addMetric', { metric: mName });
                          }}>+ Add Metric</button>
                        </div>
                        
                        <div style={{ marginBottom: '8px' }}>
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
                          const mMin = isObj && mVal.min !== undefined ? mVal.min : -100;
                          const mMax = isObj && mVal.max !== undefined ? mVal.max : 100;
                          const mColorNegative = isObj && mVal.colorNegative ? mVal.colorNegative : '#e74c3c';
                          const mColorPositive = isObj && mVal.colorPositive ? mVal.colorPositive : '#2ecc71';

                          return (
                            <div key={mName} className={styles.relationInputRow} style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                              <input 
                                type="text" 
                                defaultValue={mName} 
                                onBlur={e => {
                                  const trimmed = e.target.value.trim();
                                  if (!trimmed) {
                                    e.target.value = mName;
                                    return;
                                  }

                                  const cleanId = trimmed.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                                  const newId = cleanId || `NewMetric_${Date.now()}`;

                                  if (newId !== mName) {
                                    const otherExists = (data.values || {})[newId] !== undefined;
                                    if (otherExists) {
                                      alert(`The metric name "${trimmed}" already exists. Duplicate names are not allowed.`);
                                      e.target.value = mName;
                                      return;
                                    }
                                    handleUpdateRelations(targetName, 'renameMetric', { oldKey: mName, newKey: newId });
                                  }
                                }}
                                style={{ flex: 1, minWidth: '80px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }}>Min:</span>
                                  <input 
                                    type="number" 
                                    value={mMin}
                                    onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { min: Number(e.target.value) } })}
                                    style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }}>Max:</span>
                                  <input 
                                    type="number" 
                                    value={mMax}
                                    onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { max: Number(e.target.value) } })}
                                    style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }} title="Negative Gauge Color">Color(-):</span>
                                  <input 
                                    type="color" 
                                    value={mColorNegative}
                                    onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { colorNegative: e.target.value } })}
                                    style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }} title="Positive Gauge Color">Color(+):</span>
                                  <input 
                                    type="color" 
                                    value={mColorPositive}
                                    onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { colorPositive: e.target.value } })}
                                    style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                  />
                                </div>
                              </div>
                              <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'removeMetric', { metric: mName })}>X</button>
                            </div>
                          );
                        })}
                      </div>

                      {/* --- Incoming: Target -> Current (Two-way Data) --- */}
                      <div style={{ padding: '8px', borderLeft: '3px solid var(--rpg-text)', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-text)' }}>
                            {targetName} ➔ {targetChar.name}
                          </span>
                          <button className={styles.addQuickFieldBtn} onClick={() => {
                            const existingTargetMetrics = Object.keys(data.targetValues || {});
                            let baseName = 'NewMetric';
                            let mName = baseName;
                            let counter = 1;
                            while (existingTargetMetrics.includes(mName)) {
                              mName = `${baseName}_${counter}`;
                              counter++;
                            }
                            handleUpdateRelations(targetName, 'addTargetMetric', { metric: mName });
                          }}>+ Add Metric</button>
                        </div>
                        
                        <div style={{ marginBottom: '8px' }}>
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
                          const tmMin = isObj && tmVal.min !== undefined ? tmVal.min : -100;
                          const tmMax = isObj && tmVal.max !== undefined ? tmVal.max : 100;
                          const tmColorNegative = isObj && tmVal.colorNegative ? tmVal.colorNegative : '#e74c3c';
                          const tmColorPositive = isObj && tmVal.colorPositive ? tmVal.colorPositive : '#2ecc71';

                          return (
                            <div key={tmName} className={styles.relationInputRow} style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                              <input 
                                type="text" 
                                defaultValue={tmName} 
                                onBlur={e => {
                                  const trimmed = e.target.value.trim();
                                  if (!trimmed) {
                                    e.target.value = tmName;
                                    return;
                                  }

                                  const cleanId = trimmed.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                                  const newId = cleanId || `NewMetric_${Date.now()}`;

                                  if (newId !== tmName) {
                                    const otherExists = (data.targetValues || {})[newId] !== undefined;
                                    if (otherExists) {
                                      alert(`The metric name "${trimmed}" already exists. Duplicate names are not allowed.`);
                                      e.target.value = tmName;
                                      return;
                                    }
                                    handleUpdateRelations(targetName, 'renameTargetMetric', { oldKey: tmName, newKey: newId });
                                  }
                                }}
                                style={{ flex: 1, minWidth: '80px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', outline: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }}>Min:</span>
                                  <input 
                                    type="number" 
                                    value={tmMin}
                                    onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { min: Number(e.target.value) } })}
                                    style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }}>Max:</span>
                                  <input 
                                    type="number" 
                                    value={tmMax}
                                    onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { max: Number(e.target.value) } })}
                                    style={{ width: '40px', background: 'rgba(0,0,0,0.3)', color: 'var(--rpg-text)', border: '1px solid var(--rpg-border)', borderRadius: '3px', fontSize: '11px', textAlign: 'center', padding: '4px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }} title="Negative Gauge Color">Color(-):</span>
                                  <input 
                                    type="color" 
                                    value={tmColorNegative}
                                    onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { colorNegative: e.target.value } })}
                                    style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', opacity: 0.6 }} title="Positive Gauge Color">Color(+):</span>
                                  <input 
                                    type="color" 
                                    value={tmColorPositive}
                                    onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { colorPositive: e.target.value } })}
                                    style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                  />
                                </div>
                              </div>
                              <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'removeTargetMetric', { metric: tmName })}>X</button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className={styles.inventoryTabBody}>
              <div className={styles.invActionBar}>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const equip = { ...(targetChar.inventory?.equipment || {}) };
                  let baseName = 'NewSlot';
                  let name = baseName;
                  let counter = 1;
                  while (equip[name] !== undefined) {
                    name = `${baseName}_${counter}`;
                    counter++;
                  }
                  equip[name] = null;
                  handleUpdateNestedField('inventory', 'equipment', equip);
                }}>+ Add Slot</button>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const storage = { ...(targetChar.inventory?.storage || {}) };
                  let baseName = 'NewContainer';
                  let name = baseName;
                  let counter = 1;
                  while (storage[name] !== undefined) {
                    name = `${baseName}_${counter}`;
                    counter++;
                  }
                  storage[name] = [];
                  handleUpdateNestedField('inventory', 'storage', storage);
                }}>+ Add Container</button>
                <button type="button" className={styles.invActionBtn} onClick={() => {
                  const storage = { ...(targetChar.inventory?.storage || {}) };
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
                  {(() => {
                    const slotsList = Object.entries(targetChar.inventory?.equipment || {});
                    const totalSlots = slotsList.length;
                    return slotsList.map(([slotKey, item], slotIdx) => (
                    <div 
                      key={slotKey} 
                      className={styles.invSlotCard}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(e, 'equipment', slotKey)}
                    >
                      <div className={styles.slotHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, marginRight: "10px" }}>
                          <input 
                            type="text" 
                            className={styles.slotRenameInput} 
                            defaultValue={slotKey}
                            onBlur={e => {
                              const newKey = e.target.value.trim();
                              if (!newKey) {
                                e.target.value = slotKey;
                                return;
                              }
                              if (newKey !== slotKey && (targetChar.inventory?.equipment || {})[newKey] !== undefined) {
                                alert(`The slot name "${newKey}" already exists. Duplicate names are not allowed.`);
                                e.target.value = slotKey;
                                return;
                              }
                              if (newKey !== slotKey) {
                                const equip = { ...(targetChar.inventory?.equipment || {}) };
                                equip[newKey] = equip[slotKey];
                                delete equip[slotKey];
                                handleUpdateNestedField("inventory", "equipment", equip);
                              }
                            }}
                            style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid var(--rpg-border)", color: "var(--rpg-text)", fontSize: "11px", outline: "none", padding: "4px 8px", borderRadius: "4px" }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <button type="button" className={styles.sortBtn} disabled={slotIdx === 0} onClick={() => handleReorderEquipmentSlot(slotKey, "up")} style={{ padding: "2px 4px", fontSize: "9px" }}>▲</button>
                          <button type="button" className={styles.sortBtn} disabled={slotIdx === totalSlots - 1} onClick={() => handleReorderEquipmentSlot(slotKey, "down")} style={{ padding: "2px 4px", fontSize: "9px" }}>▼</button>
                          <button type="button" className={styles.removeInlineBtn} onClick={() => {
                            const equip = { ...(targetChar.inventory?.equipment || {}) };
                            delete equip[slotKey];
                            handleUpdateNestedField("inventory", "equipment", equip);
                          }}>X</button>
                        </div>
                      </div>

                      {item ? (
                        <div 
                          className={styles.equippedItem}
                          draggable
                          onDragStart={e => handleDragStart(e, 'equipment', slotKey, null, item)}
                        >
                          <div className={styles.itemText} style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '3px' }}>
                            <input 
                              type="text"
                              className={styles.itemTitleInput}
                              value={item.name || ''}
                              placeholder="Equipped item name..."
                              onChange={e => {
                                const equip = { ...(targetChar.inventory?.equipment || {}) };
                                equip[slotKey] = { ...(equip[slotKey] || {}), name: e.target.value };
                                handleUpdateNestedField('inventory', 'equipment', equip);
                              }}
                              style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '2px 0' }}
                            />
                            <input 
                              type="text"
                              className={styles.itemDescInput}
                              value={item.desc || ''}
                              placeholder="Description..."
                              onChange={e => {
                                const equip = { ...(targetChar.inventory?.equipment || {}) };
                                equip[slotKey] = { ...(equip[slotKey] || {}), desc: e.target.value };
                                handleUpdateNestedField('inventory', 'equipment', equip);
                              }}
                              style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--rpg-text)', fontSize: '10px', opacity: 0.6, outline: 'none', padding: '2px 0' }}
                            />
                          </div>
                          <button type="button" className={styles.unequipBtn} onClick={() => {
                            const equip = { ...(targetChar.inventory?.equipment || {}) };
                            equip[slotKey] = null;
                            const storage = { ...(targetChar.inventory?.storage || {}) };
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
                    ));
                  })()}
                </div>
              </div>

              <div className={styles.invSection}>
                <h5 className={styles.invSectionTitle}>Containers & Items</h5>
                <div className={styles.invStorageGrid}>
                  {(() => {
                    const storagesList = Object.entries(targetChar.inventory?.storage || {});
                    const totalStorages = storagesList.length;
                    return storagesList.map(([storageKey, items], sIdx) => {
                    const itemList = Array.isArray(items) ? items : [];
                    return (
                      <div 
                        key={storageKey} 
                        className={styles.invStorageBox}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleDrop(e, 'storage', storageKey)}
                      >
                        <div className={styles.slotHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, marginRight: '10px' }}>
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
                                if (!newKey) {
                                  e.target.value = storageKey;
                                  return;
                                }
                                if (newKey !== storageKey && (targetChar.inventory?.storage || {})[newKey] !== undefined) {
                                  alert(`The storage container name "${newKey}" already exists. Duplicate names are not allowed.`);
                                  e.target.value = storageKey;
                                  return;
                                }
                                if (newKey !== storageKey) {
                                  const storage = { ...(targetChar.inventory?.storage || {}) };
                                  storage[newKey] = storage[storageKey];
                                  delete storage[storageKey];
                                  handleUpdateNestedField('inventory', 'storage', storage);
                                }
                              }}
                              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '4px 8px', borderRadius: '4px' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <button type="button" className={styles.sortBtn} disabled={sIdx === 0} onClick={() => handleReorderStorage(storageKey, 'up')} style={{ padding: '2px 4px', fontSize: '9px' }}>▲</button>
                            <button type="button" className={styles.sortBtn} disabled={sIdx === totalStorages - 1} onClick={() => handleReorderStorage(storageKey, 'down')} style={{ padding: '2px 4px', fontSize: '9px' }}>▼</button>
                            <button type="button" className={styles.removeInlineBtn} onClick={() => {
                              const storage = { ...(targetChar.inventory?.storage || {}) };
                              delete storage[storageKey];
                              handleUpdateNestedField('inventory', 'storage', storage);
                            }}>X</button>
                          </div>
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
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                  e.stopPropagation();
                                  handleDrop(e, 'storage', storageKey, idx);
                                }}
                              >
                                <div style={{ width: '100%' }}>
                                  <div className={styles.itemTitleLine} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input 
                                      type="text" 
                                      className={styles.itemTitleInput} 
                                      value={item.name} 
                                      placeholder="Item name..."
                                      onChange={e => {
                                        const storage = { ...(targetChar.inventory?.storage || {}) };
                                        storage[storageKey][idx].name = e.target.value;
                                        handleUpdateNestedField('inventory', 'storage', storage);
                                      }}
                                      style={{ flex: 1, width: 'auto' }}
                                    />
                                    <div className={styles.itemQtyBox} style={{ opacity: 0.95, flexShrink: 0 }}>
                                      <input 
                                        type="number" 
                                        className={styles.itemQtyInput} 
                                        value={item.quantity || 1} 
                                        onChange={e => {
                                          const storage = { ...(targetChar.inventory?.storage || {}) };
                                          storage[storageKey][idx].quantity = Number(e.target.value);
                                          handleUpdateNestedField('inventory', 'storage', storage);
                                        }}
                                        style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--rpg-border)', color: 'var(--rpg-text)', fontSize: '11px', outline: 'none', padding: '2px 6px', borderRadius: '4px', width: '32px', textAlign: 'center', fontWeight: 'bold', display: 'inline-block' }}
                                      />
                                    </div>
                                    <button type="button" className={styles.itemDeleteBtn} onClick={() => {
                                      const storage = { ...(targetChar.inventory?.storage || {}) };
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
                                      const storage = { ...(targetChar.inventory?.storage || {}) };
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
                  });
                  })()}
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
