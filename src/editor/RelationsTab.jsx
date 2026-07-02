// src/editor/tabs/RelationsTab.jsx
import React, { useState } from 'react';
import styles from './StatusEditor.module.css';

export default function RelationsTab({
  charId, targetChar, localCharacters, setLocalCharacters,
  expandedIds, setExpandedIds
}) {
  const [relationPreset, setRelationPreset] = useState('-100~100');
  const [relationMin, setRelationMin] = useState(-100);
  const [relationMax, setRelationMax] = useState(100);

  const handleUpdateRelations = (targetName, action, data) => {
    setLocalCharacters(localCharacters.map(c => {
      if (c.id !== charId) return c;
      const nextRelations = { ...(c.relations || {}) };

      if (action === 'add') {
        if (!nextRelations[targetName]) {
          nextRelations[targetName] = { text: '', targetText: '', isLocked: false, isInject: true, values: { 'Affection': { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } }, targetValues: {} };
        }
        return { ...c, relations: nextRelations };
      }

      if (action === 'remove') {
        delete nextRelations[targetName];
        return { ...c, relations: nextRelations };
      }

      const targetData = nextRelations[targetName]
        ? JSON.parse(JSON.stringify(nextRelations[targetName]))
        : { text: '', targetText: '', isLocked: false, isInject: true, values: {}, targetValues: {} };

      if (action === 'updateField') {
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
      } else if (action === 'updateTargetMetricField') {
        targetData.targetValues = targetData.targetValues || {};
        const old = targetData.targetValues[data.field];
        if (typeof old === 'object' && old !== null) {
          targetData.targetValues[data.field] = { ...old, value: data.value };
        } else {
          targetData.targetValues[data.field] = { value: data.value, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
        }
      } else if (action === 'updateMetricConfig') {
        const mKey = data.metric;
        const old = targetData.values[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
        targetData.values[mKey] = { ...currentObj, ...data.config };
      } else if (action === 'updateTargetMetricConfig') {
        targetData.targetValues = targetData.targetValues || {};
        const mKey = data.metric;
        const old = targetData.targetValues[mKey];
        const currentObj = typeof old === 'object' && old !== null ? old : { value: old || 0, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
        targetData.targetValues[mKey] = { ...currentObj, ...data.config };
      } else if (action === 'renameMetric') {
        const nextValues = { ...targetData.values };
        nextValues[data.newKey] = nextValues[data.oldKey];
        delete nextValues[data.oldKey];
        targetData.values = nextValues;
      } else if (action === 'renameTargetMetric') {
        targetData.targetValues = targetData.targetValues || {};
        const nextValues = { ...targetData.targetValues };
        nextValues[data.newKey] = nextValues[data.oldKey];
        delete nextValues[data.oldKey];
        targetData.targetValues = nextValues;
      } else if (action === 'removeMetric') {
        const nextValues = { ...targetData.values };
        delete nextValues[data.metric];
        targetData.values = nextValues;
      } else if (action === 'removeTargetMetric') {
        targetData.targetValues = targetData.targetValues || {};
        const nextValues = { ...targetData.targetValues };
        delete nextValues[data.metric];
        targetData.targetValues = nextValues;
      } else if (action === 'addMetric') {
        targetData.values = { ...(targetData.values || {}), [data.metric]: { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } };
      } else if (action === 'addTargetMetric') {
        targetData.targetValues = { ...(targetData.targetValues || {}), [data.metric]: { value: 0, min: relationMin, max: relationMax, colorNegative: '#e74c3c', colorPositive: '#2ecc71' } };
      }
      nextRelations[targetName] = targetData;
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
      } else return c;

      const nextRelations = {};
      nextKeys.forEach(k => { nextRelations[k] = relations[k]; });
      return { ...c, relations: nextRelations };
    }));
  };

  const relationsList = Object.entries(targetChar.relations || {});
  const totalRelations = relationsList.length;

  return (
    <div className={styles.relationsTabBody}>
      <div className={styles.tabHeaderRow}>
        <span>Relations Schema & Values</span>
        <div className={styles.flexCenterGroup}>
          <select
            value={relationPreset}
            onChange={e => {
              setRelationPreset(e.target.value);
              if (e.target.value === '-100~100') { setRelationMin(-100); setRelationMax(100); }
            }}
            className={styles.presetSelect}
          >
            <option value="-100~100">-100~100</option>
            <option value="custom">custom</option>
          </select>
          <div className={styles.metricLimitWrapper}>
            <span className={styles.metricLimitLabel}>min</span>
            <input type="number" value={relationMin} disabled={relationPreset !== 'custom'} onChange={e => setRelationMin(Number(e.target.value))} className={styles.limitInput} />
            <span className={styles.metricLimitLabel}>max</span>
            <input type="number" value={relationMax} disabled={relationPreset !== 'custom'} onChange={e => setRelationMax(Number(e.target.value))} className={styles.limitInput} />
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

      {totalRelations === 0 ? (
        <p className={styles.emptySectionText}>No relations recorded.</p>
      ) : (
        relationsList.map(([targetName, data], rIdx) => {
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
                >
                  ▶
                </button>
                <input
                  type="text"
                  defaultValue={targetName}
                  onBlur={e => {
                    const newName = e.target.value.trim();
                    if (!newName) { e.target.value = targetName; return; }
                    if (newName !== targetName && (targetChar.relations || {})[newName] !== undefined) {
                      alert(`The relation target "${newName}" already exists.`);
                      e.target.value = targetName; return;
                    }
                    if (newName !== targetName) {
                      const nextRelations = { ...(targetChar.relations || {}) };
                      nextRelations[newName] = nextRelations[targetName];
                      delete nextRelations[targetName];
                      setLocalCharacters(localCharacters.map(c => c.id === charId ? { ...c, relations: nextRelations } : c));
                    }
                  }}
                  className={styles.nameInput}
                  style={{ flex: 1, fontWeight: 'bold', marginLeft: '6px' }}
                />
                <div className={styles.flexItemLine}>
                  <button type="button" className={`${styles.sortBtn} ${styles.miniSortBtn}`} disabled={rIdx === 0} onClick={() => handleReorderRelation(targetName, 'up')}>▲</button>
                  <button type="button" className={`${styles.sortBtn} ${styles.miniSortBtn}`} disabled={rIdx === totalRelations - 1} onClick={() => handleReorderRelation(targetName, 'down')}>▼</button>
                  {isRealCharacter && <span className={styles.syncBadge}>Real Character (Synced)</span>}
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
                          setLocalCharacters(localCharacters.map(c => c.id === charId ? { ...c, relations: nextRelations } : c));
                        }}
                      />
                      <span className={styles.switchSlider}></span>
                    </div>
                  </label>
                  <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'remove')}>X</button>
                </div>
              </div>

              {isExpanded && (
                <>
                  <div className={styles.sectionWrapper} style={{ borderLeft: '3px solid var(--rpg-text)', marginBottom: '10px' }}>
                    <div className={styles.sectionHeaderLine}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-text)' }}>{targetChar.name} ➔ {targetName}</span>
                      <button className={styles.addQuickFieldBtn} onClick={() => {
                        const existingMetrics = Object.keys(data.values || {});
                        let mName = 'NewMetric';
                        let counter = 1;
                        while (existingMetrics.includes(mName)) { mName = `NewMetric_${counter++}`; }
                        handleUpdateRelations(targetName, 'addMetric', { metric: mName });
                      }}>+ Add Metric</button>
                    </div>

                    <textarea
                      value={data.text || ''}
                      placeholder={`How ${targetChar.name} feels about ${targetName}...`}
                      onChange={e => handleUpdateRelations(targetName, 'updateField', { field: 'text', value: e.target.value })}
                      className={styles.descTextarea}
                    />

                    {Object.entries(data.values || {}).map(([mName, mVal]) => {
                      const isObj = typeof mVal === 'object' && mVal !== null;
                      const mMin = isObj && mVal.min !== undefined ? mVal.min : -100;
                      const mMax = isObj && mVal.max !== undefined ? mVal.max : 100;
                      const mColorNegative = isObj && mVal.colorNegative ? mVal.colorNegative : '#e74c3c';
                      const mColorPositive = isObj && mVal.colorPositive ? mVal.colorPositive : '#2ecc71';

                      return (
                        <div key={mName} className={styles.relationInputRow} style={{ marginTop: '4px' }}>
                          <input
                            type="text"
                            defaultValue={mName}
                            onBlur={e => {
                              const trimmed = e.target.value.trim();
                              if (!trimmed) { e.target.value = mName; return; }
                              const cleanId = trimmed.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                              const newId = cleanId || `NewMetric_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                              if (newId !== mName) {
                                if ((data.values || {})[newId] !== undefined) { alert(`Metric "${trimmed}" exists.`); e.target.value = mName; return; }
                                handleUpdateRelations(targetName, 'renameMetric', { oldKey: mName, newKey: newId });
                              }
                            }}
                            className={styles.metricNameInput}
                          />
                          <div className={styles.flexItemLine}>
                            <div className={styles.flexCenterGroupSmall}><span className={styles.metricLimitLabel}>Min:</span><input type="number" value={mMin} onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { min: Number(e.target.value) } })} className={styles.metricLimitInput} /></div>
                            <div className={styles.flexCenterGroupSmall}><span className={styles.metricLimitLabel}>Max:</span><input type="number" value={mMax} onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { max: Number(e.target.value) } })} className={styles.metricLimitInput} /></div>
                            <div className={styles.flexCenterGroupSmall} title="Negative Color"><span className={styles.metricLimitLabel}>Col(-):</span><input type="color" value={mColorNegative} onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { colorNegative: e.target.value } })} className={styles.colorPickerInput} /></div>
                            <div className={styles.flexCenterGroupSmall} title="Positive Color"><span className={styles.metricLimitLabel}>Col(+):</span><input type="color" value={mColorPositive} onChange={e => handleUpdateRelations(targetName, 'updateMetricConfig', { metric: mName, config: { colorPositive: e.target.value } })} className={styles.colorPickerInput} /></div>
                          </div>
                          <button type="button" className={styles.removeInlineBtn} onClick={() => handleUpdateRelations(targetName, 'removeMetric', { metric: mName })}>X</button>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.sectionWrapper} style={{ borderLeft: '3px solid var(--rpg-text)' }}>
                    <div className={styles.sectionHeaderLine}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rpg-text)' }}>{targetName} ➔ {targetChar.name}</span>
                      <button className={styles.addQuickFieldBtn} onClick={() => {
                        const existingTargetMetrics = Object.keys(data.targetValues || {});
                        let mName = 'NewMetric';
                        let counter = 1;
                        while (existingTargetMetrics.includes(mName)) { mName = `NewMetric_${counter++}`; }
                        handleUpdateRelations(targetName, 'addTargetMetric', { metric: mName });
                      }}>+ Add Metric</button>
                    </div>

                    <textarea
                      value={data.targetText || ''}
                      placeholder={`How ${targetName} feels about ${targetChar.name}...`}
                      onChange={e => handleUpdateRelations(targetName, 'updateField', { field: 'targetText', value: e.target.value })}
                      className={styles.descTextarea}
                    />

                    {Object.entries(data.targetValues || {}).map(([tmName, tmVal]) => {
                      const isObj = typeof tmVal === 'object' && tmVal !== null;
                      const tmMin = isObj && tmVal.min !== undefined ? tmVal.min : -100;
                      const tmMax = isObj && tmVal.max !== undefined ? tmVal.max : 100;
                      const tmColorNegative = isObj && tmVal.colorNegative ? tmVal.colorNegative : '#e74c3c';
                      const tmColorPositive = isObj && tmVal.colorPositive ? tmVal.colorPositive : '#2ecc71';

                      return (
                        <div key={tmName} className={styles.relationInputRow} style={{ marginTop: '4px' }}>
                          <input
                            type="text"
                            defaultValue={tmName}
                            onBlur={e => {
                              const trimmed = e.target.value.trim();
                              if (!trimmed) { e.target.value = tmName; return; }
                              const cleanId = trimmed.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                              const newId = cleanId || `NewMetric_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                              if (newId !== tmName) {
                                if ((data.targetValues || {})[newId] !== undefined) { alert(`Metric "${trimmed}" exists.`); e.target.value = tmName; return; }
                                handleUpdateRelations(targetName, 'renameTargetMetric', { oldKey: tmName, newKey: newId });
                              }
                            }}
                            className={styles.metricNameInput}
                          />
                          <div className={styles.flexItemLine}>
                            <div className={styles.flexCenterGroupSmall}><span className={styles.metricLimitLabel}>Min:</span><input type="number" value={tmMin} onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { min: Number(e.target.value) } })} className={styles.metricLimitInput} /></div>
                            <div className={styles.flexCenterGroupSmall}><span className={styles.metricLimitLabel}>Max:</span><input type="number" value={tmMax} onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { max: Number(e.target.value) } })} className={styles.metricLimitInput} /></div>
                            <div className={styles.flexCenterGroupSmall} title="Negative Color"><span className={styles.metricLimitLabel}>Col(-):</span><input type="color" value={tmColorNegative} onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { colorNegative: e.target.value } })} className={styles.colorPickerInput} /></div>
                            <div className={styles.flexCenterGroupSmall} title="Positive Color"><span className={styles.metricLimitLabel}>Col(+):</span><input type="color" value={tmColorPositive} onChange={e => handleUpdateRelations(targetName, 'updateTargetMetricConfig', { metric: tmName, config: { colorPositive: e.target.value } })} className={styles.colorPickerInput} /></div>
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
        })
      )}
    </div>
  );
}