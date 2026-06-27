// src/tracker/StatusComponent.jsx
import React, { useState, useRef, useEffect } from 'react';
import styles from './StatusComponent.module.css';

// 완료 체크용 SVG 버튼 컴포넌트
const CheckSvg = ({ checked, onClick }) => (
  <svg 
    onClick={onClick}
    viewBox="0 0 24 24" 
    width="16" 
    height="16" 
    style={{ 
      cursor: 'pointer', 
      color: checked ? 'var(--rpg-highlight)' : 'var(--rpg-text)', 
      opacity: checked ? 1 : 0.4,
      flexShrink: 0,
      transition: 'color 0.15s, opacity 0.15s'
    }}
  >
    {checked ? (
      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    ) : (
      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    )}
  </svg>
);

// 공통 Auto-Growing & Drag-Resize TextArea 컴포넌트
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
      style={{ resize: isFocused ? 'vertical' : 'none' }}
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

export default function StatusComponent({ char, characters = [], activeTabs, onPatchCharacter, onPatchOtherCharacter, globalRelationSchema = [], onOpenEditor }) {
  const profile = char.profile || { race: '', height: '', hair: '', eye: '', personality: '' };
  const relations = char.relations || {};
  const inventory = char.inventory || {
    equipment: { right_hand: null, left_hand: null },
    storage: { backpack: [], pouch: [] }
  };
  const quests = char.quests || {
    main: { name: '', desc: '' },
    sides: []
  };

  // --- Relations Local State (Inline Target Add) ---
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [newRelationName, setNewRelationName] = useState('');

  // --- Inventory Local State for Safe Save ---
  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState(null);

  // --- Inline Form State for Inventory ---
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');

  const [isAddingStorage, setIsAddingStorage] = useState(false);
  const [newStorageName, setNewStorageName] = useState('');

  // Drag and Drop State Tracking
  const [draggedItem, setDraggedItem] = useState(null); 

  useEffect(() => {
    if (isInvModalOpen) {
      setLocalInventory(JSON.parse(JSON.stringify(inventory)));
    }
  }, [isInvModalOpen, inventory]);

  const updateNestedField = (group, key, val) => {
    onPatchCharacter(c => {
      return {
        ...c,
        [group]: val
      };
    });
  };

  const handleApplyInventorySave = () => {
    if (localInventory) {
      updateNestedField('inventory', null, localInventory);
      alert("Inventory changes saved successfully.");
      setIsInvModalOpen(false);
    }
  };

  // --- Relations Actions ---
  const handleCreateRelationTargetInline = (e) => {
    e.preventDefault();
    const trimmed = newRelationName.trim();
    if (!trimmed) {
      setShowAddRelation(false);
      return;
    }
    if (relations[trimmed]) {
      alert("This character already exists in the relation list.");
      return;
    }

    onPatchCharacter(c => {
      const nextRelations = { ...(c.relations || {}) };
      nextRelations[trimmed] = {
        text: '',
        values: {
          'Affection': 0
        }
      };
      return { ...c, relations: nextRelations };
    });

    setNewRelationName('');
    setShowAddRelation(false);
  };

  const handleRemoveRelationTarget = (targetName) => {
    if (window.confirm(`Are you sure you want to remove relations with ${targetName}?`)) {
      onPatchCharacter(c => {
        const nextRelations = { ...(c.relations || {}) };
        delete nextRelations[targetName];
        return { ...c, relations: nextRelations };
      });
    }
  };

  const handleUpdateRelationField = (targetName, field, value) => {
    onPatchCharacter(c => {
      const nextRelations = { ...(c.relations || {}) };
      const targetData = nextRelations[targetName] || { text: '', values: {} };
      
      if (field === 'text') {
        targetData.text = value;
      } else {
        const isObj = typeof value === 'object' && value !== null;
        const targetValObj = targetData.values[field];
        const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;
        
        let newVal = isObj ? value.value : value;
        let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : 0);
        let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);
        
        const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));
        
        if (isTargetObj || isObj) {
          targetData.values[field] = {
            ...(isTargetObj ? targetValObj : {}),
            ...(isObj ? value : {}),
            value: clampedVal
          };
        } else {
          targetData.values[field] = clampedVal;
        }
      }
      
      nextRelations[targetName] = targetData;
      return { ...c, relations: nextRelations };
    });
  };

  // 상대방이 나에게 느끼는 수치 및 묘사 (targetText, targetValues) 수정 핸들러
  const handleUpdateTargetRelationField = (targetName, field, value) => {
    const targetChar = characters.find(c => (c.name || '').trim() === targetName.trim());
    
    if (targetChar && onPatchOtherCharacter) {
      // 상대 캐릭터 카드가 활성 목록에 존재하면 실시간 동기화 (상대방 카드의 나에 대한 관계 데이터를 직접 업데이트)
      onPatchOtherCharacter(targetChar.id, c => {
        const nextRelations = { ...(c.relations || {}) };
        const myName = char.name || 'New Character';
        const targetData = nextRelations[myName] || { text: '', values: {} };
        
        if (field === 'text') {
          targetData.text = value;
        } else {
          const isObj = typeof value === 'object' && value !== null;
          targetData.values = targetData.values || {};
          const targetValObj = targetData.values[field];
          const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;
          
          let newVal = isObj ? value.value : value;
          let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : 0);
          let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);
          const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));
          
          if (isTargetObj || isObj) {
            targetData.values[field] = {
              ...(isTargetObj ? targetValObj : {}),
              ...(isObj ? value : {}),
              value: clampedVal
            };
          } else {
            targetData.values[field] = clampedVal;
          }
        }
        
        nextRelations[myName] = targetData;
        return { ...c, relations: nextRelations };
      });
    } else {
      // 상대 캐릭터 카드가 존재하지 않으면 현재 카드의 예비 슬롯(targetText, targetValues) 업데이트
      onPatchCharacter(c => {
        const nextRelations = { ...(c.relations || {}) };
        const targetData = nextRelations[targetName] || { text: '', values: {}, targetText: '', targetValues: {} };
        
        if (field === 'text') {
          targetData.targetText = value;
        } else {
          const isObj = typeof value === 'object' && value !== null;
          targetData.targetValues = targetData.targetValues || {};
          const targetValObj = targetData.targetValues[field];
          const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;
          
          let newVal = isObj ? value.value : value;
          let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : 0);
          let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);
          const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));
          
          if (isTargetObj || isObj) {
            targetData.targetValues[field] = {
              ...(isTargetObj ? targetValObj : {}),
              ...(isObj ? value : {}),
              value: clampedVal
            };
          } else {
            targetData.targetValues[field] = clampedVal;
          }
        }
        
        nextRelations[targetName] = targetData;
        return { ...c, relations: nextRelations };
      });
    }
  };

  // --- Equipment & Container Inline Add Handlers ---
  const handleCommitNewSlot = () => {
    const trimmed = newSlotName.trim();
    if (!trimmed) {
      setIsAddingSlot(false);
      return;
    }
    setLocalInventory(prev => {
      const equip = prev.equipment || {};
      if (equip[trimmed] !== undefined) {
        alert("This equipment slot already exists.");
        return prev;
      }
      return {
        ...prev,
        equipment: { ...equip, [trimmed]: null }
      };
    });
    setNewSlotName('');
    setIsAddingSlot(false);
  };

  const handleCommitNewStorage = () => {
    const trimmed = newStorageName.trim();
    if (!trimmed) {
      setIsAddingStorage(false);
      return;
    }
    setLocalInventory(prev => {
      const storage = prev.storage || {};
      if (storage[trimmed] !== undefined) {
        alert("This container already exists.");
        return prev;
      }
      return {
        ...prev,
        storage: { ...storage, [trimmed]: [] }
      };
    });
    setNewStorageName('');
    setIsAddingStorage(false);
  };

  // 비동기 종속성 레이스 컨디션을 완전히 해결한 병합 트랜잭션 함수
  const handleAddNewItemInline = () => {
    if (!localInventory) return;
    setLocalInventory(prev => {
      const currentStorage = prev.storage || {};
      const storageKeys = Object.keys(currentStorage);
      let targetKey = storageKeys[0];

      // 타겟 컨테이너 복사본 생성
      const updatedStorage = { ...currentStorage };
      if (!targetKey) {
        targetKey = 'backpack';
        updatedStorage[targetKey] = [];
      }

      const targetList = updatedStorage[targetKey] || [];
      const newItem = {
        id: `item_${Date.now()}`,
        name: '',
        desc: '',
        quantity: 1,
        isNew: true
      };

      updatedStorage[targetKey] = [newItem, ...targetList];

      return {
        ...prev,
        storage: updatedStorage
      };
    });
  };

  // --- Inline Edit Synchronization for Inventory ---
  const handleItemFieldChange = (containerKey, index, field, value) => {
    setLocalInventory(prev => {
      const targetList = [...(prev.storage[containerKey] || [])];
      targetList[index] = { ...targetList[index], [field]: value };
      return {
        ...prev,
        storage: { ...prev.storage, [containerKey]: targetList }
      };
    });
  };

  const handleRemoveLocalItem = (containerKey, index) => {
    setLocalInventory(prev => {
      const targetList = (prev.storage[containerKey] || []).filter((_, idx) => idx !== index);
      return {
        ...prev,
        storage: { ...prev.storage, [containerKey]: targetList }
      };
    });
  };

  const handleRenameSlotKey = (oldKey, newKey) => {
    const trimmed = newKey.trim();
    if (!trimmed || oldKey === trimmed) return;
    setLocalInventory(prev => {
      const equip = { ...prev.equipment };
      equip[trimmed] = equip[oldKey];
      delete equip[oldKey];
      return { ...prev, equipment: equip };
    });
  };

  const handleRemoveSlot = (slotKey) => {
    if (window.confirm(`Are you sure you want to delete slot: ${slotKey}?`)) {
      setLocalInventory(prev => {
        const equip = { ...prev.equipment };
        delete equip[slotKey];
        return { ...prev, equipment: equip };
      });
    }
  };

  const handleRenameStorageKey = (oldKey, newKey) => {
    const trimmed = newKey.trim();
    if (!trimmed || oldKey === trimmed) return;
    setLocalInventory(prev => {
      const storage = { ...prev.storage };
      storage[trimmed] = storage[oldKey];
      delete storage[oldKey];
      return { ...prev, storage };
    });
  };

  const handleRemoveStorage = (storageKey) => {
    if (window.confirm(`Are you sure you want to delete container: ${storageKey}?`)) {
      setLocalInventory(prev => {
        const storage = { ...prev.storage };
        delete storage[storageKey];
        return { ...prev, storage };
      });
    }
  };

  // --- HTML5 Drag & Drop Core Mechanics ---
  const handleDragStart = (e, sourceLoc, sourceKey, index, item) => {
    setDraggedItem({ sourceLoc, sourceKey, index, item });
  };

  const handleDrop = (e, destLoc, destKey) => {
    e.preventDefault();
    if (!draggedItem) return;

    setLocalInventory(prev => {
      const nextEquip = { ...(prev.equipment || {}) };
      const nextStorage = { ...(prev.storage || {}) };

      // 1. 소스 지점에서 아이템 추출 및 삭제
      if (draggedItem.sourceLoc === 'equipment') {
        nextEquip[draggedItem.sourceKey] = null;
      } else {
        nextStorage[draggedItem.sourceKey] = (nextStorage[draggedItem.sourceKey] || []).filter((_, idx) => idx !== draggedItem.index);
      }

      // 2. 타겟 지점에 주입
      if (destLoc === 'equipment') {
        const displacedItem = nextEquip[destKey];
        nextEquip[destKey] = draggedItem.item;

        if (displacedItem) {
          const firstStoreKey = Object.keys(nextStorage)[0] || 'backpack';
          if (!nextStorage[firstStoreKey]) nextStorage[firstStoreKey] = [];
          nextStorage[firstStoreKey].push(displacedItem);
        }
      } else {
        if (!nextStorage[destKey]) nextStorage[destKey] = [];
        nextStorage[destKey].push(draggedItem.item);
      }

      return {
        ...prev,
        equipment: nextEquip,
        storage: nextStorage
      };
    });

    setDraggedItem(null);
  };

  // --- Quests Handler ---
  const handleUpdateMainQuest = (key, value) => {
    onPatchCharacter(c => {
      const currentQuests = c.quests || { main: { name: '', desc: '' }, sides: [] };
      return {
        ...c,
        quests: {
          ...currentQuests,
          main: { ...currentQuests.main, [key]: value }
        }
      };
    });
  };

  const handleAddSideQuest = () => {
    onPatchCharacter(c => {
      const currentQuests = c.quests || { main: { name: '', desc: '' }, sides: [] };
      const currentSides = currentQuests.sides || [];
      return {
        ...c,
        quests: {
          ...currentQuests,
          sides: [...currentSides, { id: `quest_${Date.now()}`, name: '', desc: '' }]
        }
      };
    });
  };

  const handleUpdateSideQuest = (id, key, value) => {
    onPatchCharacter(c => {
      const currentQuests = c.quests || { main: { name: '', desc: '' }, sides: [] };
      const currentSides = currentQuests.sides || [];
      const updatedSides = currentSides.map(q => {
        if (q.id === id) {
          const updatedQ = { ...q, [key]: value };
          if (key === 'name') {
            const cleanName = value.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
            updatedQ.id = cleanName ? `quest_${cleanName}` : `quest_${Date.now()}`;
          }
          return updatedQ;
        }
        return q;
      });
      return {
        ...c,
        quests: { ...currentQuests, sides: updatedSides }
      };
    });
  };


  

  const handleRemoveSideQuest = (id) => {
    onPatchCharacter(c => {
      const currentQuests = c.quests || { main: { name: '', desc: '' }, sides: [] };
      const currentSides = currentQuests.sides || [];
      return {
        ...c,
        quests: {
          ...currentQuests,
          sides: currentSides.filter(q => q.id !== id)
        }
      };
    });
  };

  return (
    <div className={styles.tabContentStack}>
      
      {/* A. PROFILE TAB */}
      {activeTabs.profile && (
        <div className={styles.inlineTabContent}>
          <div className={styles.inlineHeaderLabelRow}>
            <span className={styles.inlineSheetTitle}>Profile</span>
          </div>
          <div className={styles.appearanceGrid}>
            {Object.keys(profile).map((field) => {
              const isLocked = char.profileLocks?.[field] || false;
              return (
              <div key={field} className={styles.appearanceRow}>
                <svg onClick={() => {
                    const currentLocks = char.profileLocks || {};
                    updateNestedField('profileLocks', null, { ...currentLocks, [field]: !isLocked });
                  }} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${isLocked ? styles.lockIconActive : ''}`}>
                  {isLocked ? (
                    <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2 v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                  ) : (
                    <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                  )}
                </svg>
                <span className={styles.fieldLabel}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </span>
                <div className={styles.appearanceInputWrapper}>
                  <AutoGrowingTextArea
                    value={profile[field] || ''}
                    onChange={val => {
                      const currentProf = char.profile || { race: '', height: '', hair: '', eye: '', personality: '' };
                      updateNestedField('profile', null, { ...currentProf, [field]: val });
                    }}
                    placeholder={`Enter ${field}...`}
                  />
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* B. RELATIONS TAB */}
      {activeTabs.relations && (
        <div className={styles.inlineTabContent}>
          <div className={styles.inlineHeaderLabelRow}>
            <span className={styles.inlineSheetTitle}>Relations</span>
            <button 
              type="button" 
              className={styles.quickAddBtn} 
              onClick={() => onOpenEditor && onOpenEditor('relations')}
            >
              Open Editor
            </button>
          </div>

          {Object.keys(relations).length === 0 ? (
            <p className={styles.emptyPlaceholder}>No recorded relations.</p>
          ) : (
            Object.entries(relations).map(([targetName, data]) => {
              // 상대방 캐릭터 카드 정보 조회
              const targetChar = characters.find(c => (c.name || '').trim() === targetName.trim());
              const isTargetExist = !!targetChar;

              // [1] 나 ➔ 상대 수치 가공
              const metricsList = Object.entries(data.values || {}).map(([mName, mVal]) => {
                const isObj = typeof mVal === 'object' && mVal !== null;
                return {
                  name: mName,
                  value: Number(isObj ? mVal.value : mVal) || 0,
                  min: isObj && mVal.min !== undefined ? mVal.min : -100,
                  max: isObj && mVal.max !== undefined ? mVal.max : 100,
                  colorNegative: isObj && mVal.colorNegative ? mVal.colorNegative : '#e74c3c',
                  colorPositive: isObj && mVal.colorPositive ? mVal.colorPositive : '#2ecc71'
                };
              });

              // [2] 상대 ➔ 나 수치 및 묘사 가공 (하이브리드 지원)
              let targetText = "";
              let targetMetricsSource = {};
              if (isTargetExist) {
                const counterRelation = targetChar.relations?.[char.name || 'New Character'] || {};
                targetText = counterRelation.text || "";
                targetMetricsSource = counterRelation.values || {};
              } else {
                targetText = data.targetText || "";
                targetMetricsSource = data.targetValues || {};
              }

              const targetMetricsList = Object.entries(targetMetricsSource).map(([mName, mVal]) => {
                const isObj = typeof mVal === 'object' && mVal !== null;
                return {
                  name: mName,
                  value: Number(isObj ? mVal.value : mVal) || 0,
                  min: isObj && mVal.min !== undefined ? mVal.min : -100,
                  max: isObj && mVal.max !== undefined ? mVal.max : 100,
                  colorNegative: isObj && mVal.colorNegative ? mVal.colorNegative : '#e74c3c',
                  colorPositive: isObj && mVal.colorPositive ? mVal.colorPositive : '#2ecc71'
                };
              });

              return (
                <div key={targetName} className={styles.relationTargetCard}>
                  {/* 카드 헤더 (상대방 이름 및 공통 스위치) */}
                  <div className={styles.relationTargetHeader}>
                    <strong className={styles.targetNameText}>
                      {targetName} {isTargetExist ? '🔗' : ''}
                    </strong>
                    <div className={styles.flexCenterGap}>
                      <svg onClick={() => onPatchCharacter(c => { const rels={...(c.relations||{})}; rels[targetName]={...rels[targetName], isLocked: !rels[targetName].isLocked}; return {...c, relations: rels}; })} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${data.isLocked ? styles.lockIconActive : ''}`}>
                        {data.isLocked ? (
                          <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2 v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                        ) : (
                          <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                        )}
                      </svg>
                    </div>
                  </div>

                  {/* 1. 내가 느끼는 관계 섹션 */}
                  <div className={styles.relationSectionGroupBlue}>
                    <span className={styles.relationSectionSubTitle}>{char.name || 'Character'} ➔ {targetName}</span>
                    
                    <div className={styles.relationDescriptionArea}>
                      <AutoGrowingTextArea
                        value={data.text || ''}
                        onChange={val => handleUpdateRelationField(targetName, 'text', val)}
                        placeholder={`Describe feelings about ${targetName}...`}
                      />
                    </div>

                    {metricsList.length > 0 && (
                      <div className={styles.relationMetricsGrid}>
                        {metricsList.map((m) => {
                          const min = m.min;
                          const max = m.max;
                          const val = Number(m.value);
                          let left = '0%';
                          let width = '0%';
                          let color = m.colorPositive;

                          if (min < 0 && max > 0) {
                            const totalRange = max - min;
                            const zeroPosition = (Math.abs(min) / totalRange) * 100;
                            
                            if (val >= 0) {
                              left = `${zeroPosition}%`;
                              width = `${Math.min(100 - zeroPosition, (val / totalRange) * 100)}%`;
                              color = m.colorPositive;
                            } else {
                              const negWidth = (Math.abs(val) / totalRange) * 100;
                              left = `${Math.max(0, zeroPosition - negWidth)}%`;
                              width = `${Math.min(zeroPosition, negWidth)}%`;
                              color = m.colorNegative;
                            }
                          } else {
                            const totalRange = max - min || 1;
                            const ratio = Math.min(100, Math.max(0, ((val - min) / totalRange) * 100));
                            left = '0%';
                            width = `${ratio}%`;
                            color = m.colorPositive;
                          }

                          return (
                            <div key={m.name} className={styles.gaugeCard}>
                              <div className={styles.gaugeLabelRow}>
                                <span className={styles.gaugeName}>{m.name}</span>
                                <div className={styles.gaugeValues}>
                                  <input 
                                    type="number" 
                                    value={m.value}
                                    onChange={(e) => handleUpdateRelationField(targetName, m.name, { ...m, value: Number(e.target.value) })}
                                    className={styles.relationGaugeInput}
                                  />
                                </div>
                              </div>
                              <div className={styles.gaugeTrack} style={{ position: 'relative' }}>
                                {min < 0 && max > 0 && (
                                  <div style={{
                                    position: 'absolute',
                                    left: `${(Math.abs(min) / (max - min)) * 100}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                    zIndex: 2
                                  }} />
                                )}
                                <div className={styles.gaugeFill} style={{ position: 'absolute', left, width, backgroundColor: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. 상대방이 나에게 느끼는 관계 섹션 */}
                  <div className={styles.relationSectionGroupRed}>
                    <span className={styles.relationSectionSubTitle}>{targetName} ➔ {char.name || 'Character'}</span>
                    
                    <div className={styles.relationDescriptionArea}>
                      <AutoGrowingTextArea
                        value={targetText}
                        onChange={val => handleUpdateTargetRelationField(targetName, 'text', val)}
                        placeholder={`${targetName}'s thoughts...`}
                      />
                    </div>

                    {targetMetricsList.length > 0 && (
                      <div className={styles.relationMetricsGrid}>
                        {targetMetricsList.map((m) => {
                          const min = m.min;
                          const max = m.max;
                          const val = Number(m.value);
                          let left = '0%';
                          let width = '0%';
                          let color = m.colorPositive;

                          if (min < 0 && max > 0) {
                            const totalRange = max - min;
                            const zeroPosition = (Math.abs(min) / totalRange) * 100;
                            
                            if (val >= 0) {
                              left = `${zeroPosition}%`;
                              width = `${Math.min(100 - zeroPosition, (val / totalRange) * 100)}%`;
                              color = m.colorPositive;
                            } else {
                              const negWidth = (Math.abs(val) / totalRange) * 100;
                              left = `${Math.max(0, zeroPosition - negWidth)}%`;
                              width = `${Math.min(zeroPosition, negWidth)}%`;
                              color = m.colorNegative;
                            }
                          } else {
                            const totalRange = max - min || 1;
                            const ratio = Math.min(100, Math.max(0, ((val - min) / totalRange) * 100));
                            left = '0%';
                            width = `${ratio}%`;
                            color = m.colorPositive;
                          }

                          return (
                            <div key={m.name} className={styles.gaugeCard}>
                              <div className={styles.gaugeLabelRow}>
                                <span className={styles.gaugeName}>{m.name}</span>
                                <div className={styles.gaugeValues}>
                                  <input 
                                    type="number" 
                                    value={m.value}
                                    onChange={(e) => handleUpdateTargetRelationField(targetName, m.name, { ...m, value: Number(e.target.value) })}
                                    className={styles.relationGaugeInput}
                                  />
                                </div>
                              </div>
                              <div className={styles.gaugeTrack} style={{ position: 'relative' }}>
                                {min < 0 && max > 0 && (
                                  <div style={{
                                    position: 'absolute',
                                    left: `${(Math.abs(min) / (max - min)) * 100}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                    zIndex: 2
                                  }} />
                                )}
                                <div className={styles.gaugeFill} style={{ position: 'absolute', left, width, backgroundColor: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

      {/* C. INVENTORY TAB */}
      {activeTabs.inventory && (
        <div className={styles.inlineTabContent}>
          <div className={styles.inlineHeaderLabelRow}>
            <span className={styles.inlineSheetTitle}>Inventory</span>
            <div className={styles.flexCenterGap}>
              <button 
                type="button" 
                className={styles.quickAddBtn} 
                onClick={() => onOpenEditor && onOpenEditor('inventory')}
              >
                Open Editor
              </button>
            </div>
          </div>

          <div className={styles.sidebarInventoryGrid}>
            <div className={styles.sidebarSection}>
              <div className={styles.sidebarSectionHeader}>
                <div className={styles.sidebarSectionTitleRow}>
                  <svg onClick={() => updateNestedField('inventory', null, {...inventory, equipIsLocked: !inventory.equipIsLocked})} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${inventory.equipIsLocked ? styles.lockIconActive : ''}`}>
                    {inventory.equipIsLocked ? (
                      <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                    ) : (
                      <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                    )}
                  </svg>
                  <span className={styles.sidebarSectionTitle} style={{ margin: 0 }}>Equipment</span>
                </div>
                <label className={styles.switchRow} title="Toggle Prompt Injection" style={{ margin: 0 }}>
                  <span>Inject</span>
                  <div className={styles.switchLabel}>
                    <input 
                      type="checkbox" 
                      className={styles.switchInput} 
                      checked={inventory.equipIsInject !== false} 
                      onChange={e => updateNestedField('inventory', null, {...inventory, equipIsInject: e.target.checked})} 
                    />
                    <span className={styles.switchSlider}></span>
                  </div>
                </label>
              </div>
              <div className={styles.sideBySideRow}>
                {Object.entries(inventory.equipment || {}).map(([slotKey, item]) => (
                  <div key={slotKey} className={styles.sidebarEquipSlot} title={item?.desc || ''}>
                    <span className={styles.slotSmallLabel}>
                      {slotKey.charAt(0).toUpperCase() + slotKey.slice(1).replace('_', ' ')}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className={styles.itemSidebarText}>{item ? item.name : 'Empty'}</span>
                      {item && item.desc && (
                        <span className={styles.itemSidebarDescText} style={{ fontSize: '9px', opacity: 0.5, marginTop: '2px' }}>
                          {item.desc}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarSectionHeader}>
                <div className={styles.sidebarSectionTitleRow}>
                  <svg onClick={() => updateNestedField('inventory', null, {...inventory, storageIsLocked: !inventory.storageIsLocked})} viewBox="0 0 24 24" width="14" height="14" className={`${styles.lockIcon} ${inventory.storageIsLocked ? styles.lockIconActive : ''}`}>
                    {inventory.storageIsLocked ? (
                      <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                    ) : (
                      <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                    )}
                  </svg>
                  <span className={styles.sidebarSectionTitle} style={{ margin: 0 }}>Storage</span>
                </div>
                <label className={styles.switchRow} title="Toggle Prompt Injection" style={{ margin: 0 }}>
                  <span>Inject</span>
                  <div className={styles.switchLabel}>
                    <input 
                      type="checkbox" 
                      className={styles.switchInput} 
                      checked={inventory.storageIsInject !== false} 
                      onChange={e => updateNestedField('inventory', null, {...inventory, storageIsInject: e.target.checked})} 
                    />
                    <span className={styles.switchSlider}></span>
                  </div>
                </label>
              </div>
              <div className={styles.sideBySideRow}>
                {Object.entries(inventory.storage || {}).map(([storageKey, items]) => {
                  const itemList = Array.isArray(items) ? items : [];
                  return (
                    <div key={storageKey} className={styles.sidebarStorageSlot}>
                      <span className={styles.slotSmallLabel}>
                        {storageKey.charAt(0).toUpperCase() + storageKey.slice(1)} ({itemList.length})
                      </span>
                      <div className={styles.sidebarStorageList}>
                        {itemList.map((item, idx) => (
                          <div key={item.id || idx} style={{ display: 'flex', flexDirection: 'column', marginBottom: '4px' }} title={item.desc || ''}>
                            <span className={styles.itemSidebarText}>
                              • {item.name || '(Unnamed)'} {item.quantity > 1 ? `(${item.quantity})` : ''}
                            </span>
                            {item.desc && (
                              <span className={styles.itemSidebarDescText} style={{ fontSize: '9px', opacity: 0.5, paddingLeft: '8px' }}>
                                {item.desc}
                              </span>
                            )}
                          </div>
                        ))}
                        {itemList.length === 0 && <span className={styles.emptyTextIndicator}>No items</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* D. QUESTS TAB */}
      {activeTabs.quests && (
        <div className={styles.inlineTabContent}>
          {/* Main Quest Header */}
          <div className={styles.inlineHeaderLabelRow}>
            <span className={styles.inlineSheetTitle}>Quest</span>
          </div>

          <div className={styles.questContainer}>
            {/* Main Quest Block */}
            <div className={styles.questContentBlock} style={quests.main?.isCompleted ? { opacity: 0.6 } : {}}>
              <div className={styles.questHeaderRow}>
                <CheckSvg 
                  checked={quests.main?.isCompleted || false} 
                  onClick={() => handleUpdateMainQuest('isCompleted', !quests.main?.isCompleted)}
                />
                <input 
                  type="text" 
                  className={`${styles.textBlockInput} ${styles.questTitleInputText}`}
                  style={{ 
                    textDecoration: quests.main?.isCompleted ? 'line-through' : 'none' 
                  }}
                  value={quests.main?.name || ''}
                  onChange={e => handleUpdateMainQuest('name', e.target.value)}
                  placeholder="Main Quest Title..."
                />
                <svg 
                  onClick={() => handleUpdateMainQuest('isLocked', !quests.main?.isLocked)} 
                  viewBox="0 0 24 24" 
                  width="14" 
                  height="14" 
                  className={`${styles.lockIcon} ${quests.main?.isLocked ? styles.lockIconActive : ''}`}
                >
                  {quests.main?.isLocked ? (
                    <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                  ) : (
                    <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                  )}
                </svg>
              </div>
              <div style={{ textDecoration: quests.main?.isCompleted ? 'line-through' : 'none' }}>
                <AutoGrowingTextArea
                  value={quests.main?.desc || ''}
                  onChange={val => handleUpdateMainQuest('desc', val)}
                  placeholder="Quest details..."
                />
              </div>
            </div>
          </div>

          {/* Side Quest Header with +add button on far right */}
          <div className={`${styles.inlineHeaderLabelRow} ${styles.sideQuestHeader}`}>
            <span className={styles.inlineSheetTitle}>Side Quests</span>
            <button 
              type="button" 
              className={styles.quickAddBtn} 
              onClick={handleAddSideQuest}
            >
              + Add Side
            </button>
          </div>

          <div className={styles.questsListContainer}>
            {(!quests.sides || quests.sides.length === 0) ? (
              <p className={styles.emptyPlaceholder}>No active side quests.</p>
            ) : (
              quests.sides.map((q, idx) => (
                <div key={q.id} className={styles.questContentBlock} style={q.isCompleted ? { opacity: 0.6 } : {}}>
                  <div className={styles.questSideHeaderRow}>
                    <span className={styles.questSideIndex}>Side Quest {idx + 1}</span>
                    <button 
                      type="button" 
                      className={styles.questSideRemoveBtn}
                      onClick={() => handleRemoveSideQuest(q.id)}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.questHeaderRow}>
                    <CheckSvg 
                      checked={q.isCompleted || false} 
                      onClick={() => handleUpdateSideQuest(q.id, 'isCompleted', !q.isCompleted)}
                    />
                    <input 
                      type="text" 
                      className={`${styles.textBlockInput} ${styles.questTitleInputText}`}
                      style={{ 
                        textDecoration: q.isCompleted ? 'line-through' : 'none' 
                      }}
                      value={q.name || ''}
                      onChange={e => handleUpdateSideQuest(q.id, 'name', e.target.value)}
                      placeholder="Side Quest Title..."
                    />
                    <svg 
                      onClick={() => handleUpdateSideQuest(q.id, 'isLocked', !q.isLocked)} 
                      viewBox="0 0 24 24" 
                      width="14" 
                      height="14" 
                      className={`${styles.lockIcon} ${q.isLocked ? styles.lockIconActive : ''}`}
                    >
                      {q.isLocked ? (
                        <path fill="currentColor" d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
                      ) : (
                        <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                      )}
                    </svg>
                  </div>
                  <div style={{ textDecoration: q.isCompleted ? 'line-through' : 'none' }}>
                    <AutoGrowingTextArea
                      value={q.desc || ''}
                      onChange={val => handleUpdateSideQuest(q.id, 'desc', val)}
                      placeholder="Quest details..."
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
}
