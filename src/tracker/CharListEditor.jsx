// src/tracker/CharListEditor.jsx
import React, { useState } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './CharListEditor.module.css';
import { DEFAULT_STATUS_SCHEMAS, DEFAULT_STATUS, getDefaultCharacters } from '../core/PromptSchema';

export default function CharListEditor({ onClose, onOpenStatusEditor }) {
  const { trackerData, updateTrackerData, settings, updateSettings } = useRPG();
  const [localCharacters, setLocalCharacters] = useState(() => 
    (trackerData.characters && trackerData.characters.length > 0)
      ? JSON.parse(JSON.stringify(trackerData.characters))
      : getDefaultCharacters()
  );
  const characters = localCharacters;
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [currentPresetId, setCurrentPresetId] = useState(trackerData.currentPresetId || '');
  const [currentPresetName, setCurrentPresetName] = useState(trackerData.currentPresetName || 'New Preset');

  const getNextAvailableId = (existingIds) => {
    const usedNumbers = existingIds
      .map(id => {
        const match = id?.match(/^RT(\d+)/i);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(num => num !== null && !isNaN(num));
    
    const numberSet = new Set(usedNumbers);
    let candidate = 1;
    while (numberSet.has(candidate)) {
      candidate++;
    }
    return `RT${candidate}`;
  };

  const handleUpdateCharacters = (newChars) => {
    setLocalCharacters(newChars);
  };

  const handleMove = (index, direction) => {
    const nextIdx = direction === 'up' ? index - 1 : index + 1;
    if (nextIdx < 0 || nextIdx >= characters.length) return;
    
    const newChars = [...characters];
    const temp = newChars[index];
    newChars[index] = newChars[nextIdx];
    newChars[nextIdx] = temp;
    
    handleUpdateCharacters(newChars);
  };

  const handleNameChange = (id, newName) => {
    const cleanIdString = (name, prefix) => {
      if (!name) return `${prefix}_${Date.now()}`;
      const clean = name.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
      return clean ? `${prefix}_${clean}` : `${prefix}_${Date.now()}`;
    };
    
    const cleanId = newName === 'New' && id === 'char_user' ? 'char_user' : cleanIdString(newName, 'char');
    
    const newChars = characters.map(c => {
      if (c.id === id) {
        return { ...c, id: cleanId, name: newName };
      }
      return c;
    });
    handleUpdateCharacters(newChars);
  };


  

  const handleDelete = (id) => {
    if (characters.length <= 1) {
      alert("At least one character must remain in the list.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this character?")) {
      const newChars = characters.filter(c => c.id !== id);
      handleUpdateCharacters(newChars);
    }
  };

  const handleAddCharacter = () => {
    const existingIds = characters.map(c => c.id);
    const newId = getNextAvailableId(existingIds);
    const newChar = {
      id: newId,
      name: "New Character",
      activePlayer: false,
      activeInjection: true,
      statusSchema: JSON.parse(JSON.stringify(DEFAULT_STATUS_SCHEMAS)),
      status: JSON.parse(JSON.stringify(DEFAULT_STATUS)),
      relations: {}
    };
    
    let newChars;
    if (characters.length === 1 && characters[0].id === 'char_user' && characters[0].name === 'New') {
      newChars = [newChar];
    } else {
      newChars = [...characters, newChar];
    }
    handleUpdateCharacters(newChars);
  };

  const handleSavePreset = () => {
    if (!currentPresetName.trim()) {
      alert("Please enter a preset name.");
      return;
    }

    const currentPresets = settings.presets || [];
    let duplicate = null;
    
    if (currentPresetId) {
      duplicate = currentPresets.find(p => p.id === currentPresetId);
    }
    if (!duplicate) {
      duplicate = currentPresets.find(p => p.name === currentPresetName);
    }

    if (duplicate) {
      if (!window.confirm(`Preset "${currentPresetName}" already exists. Overwrite?`)) {
        return;
      }
    }

    let newPresets;
    let savedId = currentPresetId;
    
    const presetData = JSON.parse(JSON.stringify(characters));

    if (duplicate) {
      newPresets = currentPresets.map(p => 
        p.id === duplicate.id ? { ...p, name: currentPresetName, data: presetData } : p
      );
      savedId = duplicate.id;
    } else {
      savedId = getNextAvailableId(currentPresets.map(p => p.id));
      newPresets = [...currentPresets, { id: savedId, name: currentPresetName, data: presetData }];
    }

    updateSettings({ presets: newPresets });
    
    setCurrentPresetId(savedId);
    updateTrackerData({
      ...trackerData,
      currentPresetId: savedId,
      currentPresetName: currentPresetName,
      characters: characters
    });
    
    alert(`Preset "${currentPresetName}" saved!`);
  };

  const handleLoadPreset = (presetId) => {
    const currentPresets = settings.presets || [];
    const preset = currentPresets.find(p => p.id === presetId);
    if (!preset) return;

    if (window.confirm(`Are you sure you want to load preset "${preset.name}"? This will overwrite your current characters.`)) {
      const loadedChars = JSON.parse(JSON.stringify(preset.data));
      
      setCurrentPresetId(preset.id);
      setCurrentPresetName(preset.name);
      setLocalCharacters(loadedChars);
      setShowDropdown(false);
    }
  };

  const handleDeletePreset = () => {
    if (!currentPresetId) {
      alert("No preset is currently active to delete.");
      return;
    }
    const currentPresets = settings.presets || [];
    const preset = currentPresets.find(p => p.id === currentPresetId);
    if (!preset) return;

    if (window.confirm(`Are you sure you want to delete preset "${preset.name}"?`)) {
      const newPresets = currentPresets.filter(p => p.id !== currentPresetId);
      updateSettings({ presets: newPresets });

      if (newPresets.length === 0) {
        const defaultChars = getDefaultCharacters();
        setCurrentPresetId('');
        setCurrentPresetName('New Preset');
        setLocalCharacters(defaultChars);
      } else {
        const fallbackPreset = newPresets[0];
        const loadedChars = JSON.parse(JSON.stringify(fallbackPreset.data));
        setCurrentPresetId(fallbackPreset.id);
        setCurrentPresetName(fallbackPreset.name);
        setLocalCharacters(loadedChars);
      }
    }
  };

  const handleGlobalSave = () => {
    const names = characters.map(c => c.name.trim());
    if (names.some(name => !name)) {
      alert("Character name cannot be empty.");
      return;
    }

    const hasDuplicates = names.some((name, index) => names.indexOf(name) !== index);
    if (hasDuplicates) {
      const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
      alert(`The character name "${duplicateName}" already exists. Duplicate names are not allowed.`);
      return;
    }

    updateTrackerData({
      ...trackerData,
      currentPresetId,
      currentPresetName,
      characters: characters
    });

    alert("Character list saved successfully!");
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h4>Character List</h4>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </header>

        <div className={styles.presetBar}>
          <div className={styles.presetDropdownContainer} style={{ flex: 1, position: 'relative' }}>
            <div className={styles.presetInputWrapper}>
              <input 
                type="text" 
                className={styles.presetNameInput}
                value={currentPresetName} 
                onChange={(e) => setCurrentPresetName(e.target.value)}
                placeholder="Preset Name"
              />
              <span className={styles.charIdBadge} style={{ margin: 0 }}>
                {currentPresetId || 'NEW'}
              </span>
            </div>
            {showDropdown && (
              <div className={styles.presetDropdown} style={{ left: 0, right: 0, width: '100%', top: '100%', marginTop: '4px' }}>
                {!(settings.presets && settings.presets.length > 0) ? (
                  <div className={styles.presetDropdownEmpty}>No presets saved.</div>
                ) : (
                  settings.presets.map(preset => (
                    <div key={preset.id} className={styles.presetDropdownItem} onClick={() => handleLoadPreset(preset.id)}>
                      <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.name}</span>
                      <span className={styles.charIdBadge} style={{ transform: 'scale(0.85)', margin: 0, flexShrink: 0 }}>{preset.id}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button 
            type="button" 
            className={styles.iconBtn} 
            title="Save Preset"
            onClick={handleSavePreset}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </button>
          <button 
            type="button" 
            className={styles.iconBtn} 
            title="Load Preset"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button 
            type="button" 
            className={`${styles.iconBtn} ${styles.deleteBtn}`} 
            title="Delete Preset"
            onClick={handleDeletePreset}
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          {characters.map((char, index) => (
            <div key={char.id} className={styles.charItem}>
              <div className={styles.dragControls}>
                <button type="button" disabled={index === 0} onClick={() => handleMove(index, 'up')}>▲</button>
                <button type="button" disabled={index === characters.length - 1} onClick={() => handleMove(index, 'down')}>▼</button>
              </div>
              <input 
                type="text" 
                className={styles.nameInput}
                value={char.name} 
                onChange={(e) => handleNameChange(char.id, e.target.value)} 
              />
              <div className={styles.actions} style={{ display: 'flex', gap: '4px' }}>
                <button 
                  type="button" 
                  className={styles.iconBtn} 
                  title="Edit Character"
                  onClick={() => onOpenStatusEditor(char.id)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                <button 
                  type="button" 
                  className={`${styles.iconBtn} ${styles.deleteBtn}`} 
                  title="Delete Character"
                  onClick={() => handleDelete(char.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button className={styles.addBtn} onClick={handleAddCharacter}>+ Add Character</button>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.saveBtn} onClick={handleGlobalSave}>Save</button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}
