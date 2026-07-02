// src/tracker/StatusComponent.jsx
import React from 'react';
import styles from './StatusComponent.module.css';
import { LockIcon } from '../Icons';
import { useRPG } from '../core/RPGControl';
import { AutoGrowingTextArea } from '../utils';

export default function StatusComponent({ char, characters = [], activeTabs, onOpenEditor }) {
  const { patchCharacterField } = useRPG();

  const profile = char.profile || { race: '', height: '', hair: '', eye: '', personality: '' };
  const relations = char.relations || {};

  // --- Relations Actions ---
  const handleUpdateRelationField = (targetName, field, value) => {
    const targetData = relations[targetName] || { text: '', values: {} };

    if (field === 'text') {
      patchCharacterField(char.id, ['relations', targetName, 'text'], value);
    } else {
      const isObj = typeof value === 'object' && value !== null;
      const targetValObj = targetData.values[field];
      const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;

      let newVal = isObj ? value.value : value;
      let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : -100);
      let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);

      const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));
      
      const finalValue = (isTargetObj || isObj) 
        ? { ...(isTargetObj ? targetValObj : {}), ...(isObj ? value : {}), value: clampedVal }
        : clampedVal;

      patchCharacterField(char.id, ['relations', targetName, 'values', field], finalValue);
    }
  };

  const handleUpdateTargetRelationField = (targetName, field, value) => {
    const targetChar = characters.find(c => (c.name || '').trim() === targetName.trim());
    const myName = char.name || 'New Character';

    if (targetChar) {
      const targetData = targetChar.relations?.[myName] || { text: '', values: {} };
      
      if (field === 'text') {
        patchCharacterField(targetChar.id, ['relations', myName, 'text'], value);
      } else {
        const isObj = typeof value === 'object' && value !== null;
        const targetValObj = targetData.values?.[field];
        const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;

        let newVal = isObj ? value.value : value;
        let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : -100);
        let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);
        const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));

        const finalValue = (isTargetObj || isObj)
          ? { ...(isTargetObj ? targetValObj : {}), ...(isObj ? value : {}), value: clampedVal }
          : clampedVal;

        patchCharacterField(targetChar.id, ['relations', myName, 'values', field], finalValue);
      }
    } else {
      const targetData = relations[targetName] || { targetText: '', targetValues: {} };

      if (field === 'text') {
        patchCharacterField(char.id, ['relations', targetName, 'targetText'], value);
      } else {
        const isObj = typeof value === 'object' && value !== null;
        const targetValObj = targetData.targetValues?.[field];
        const isTargetObj = typeof targetValObj === 'object' && targetValObj !== null;

        let newVal = isObj ? value.value : value;
        let mMin = isObj && value.min !== undefined ? value.min : (isTargetObj && targetValObj.min !== undefined ? targetValObj.min : -100);
        let mMax = isObj && value.max !== undefined ? value.max : (isTargetObj && targetValObj.max !== undefined ? targetValObj.max : 100);
        const clampedVal = Math.min(mMax, Math.max(mMin, Number(newVal)));

        const finalValue = (isTargetObj || isObj)
          ? { ...(isTargetObj ? targetValObj : {}), ...(isObj ? value : {}), value: clampedVal }
          : clampedVal;

        patchCharacterField(char.id, ['relations', targetName, 'targetValues', field], finalValue);
      }
    }
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
                  <LockIcon
                    isLocked={isLocked}
                    onClick={() => patchCharacterField(char.id, ['profileLocks', field], !isLocked)}
                    className={`${styles.lockIcon} ${isLocked ? styles.lockIconActive : ''}`}
                  />
                  <span className={styles.fieldLabel}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </span>
                  <div className={styles.appearanceInputWrapper}>
                    <AutoGrowingTextArea
                      className={styles.textBlockInput}
                      value={profile[field] || ''}
                      onChange={val => patchCharacterField(char.id, ['profile', field], val)}
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
              const targetChar = characters.find(c => (c.name || '').trim() === targetName.trim());
              const isTargetExist = !!targetChar;

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
                  <div className={styles.relationTargetHeader}>
                    <strong className={styles.targetNameText}>
                      {targetName} {isTargetExist ? '🔗' : ''}
                    </strong>
                    <div className={styles.flexCenterGap}>
                      <LockIcon
                        isLocked={data.isLocked}
                        onClick={() => patchCharacterField(char.id, ['relations', targetName, 'isLocked'], !data.isLocked)}
                        className={`${styles.lockIcon} ${data.isLocked ? styles.lockIconActive : ''}`}
                      />
                    </div>
                  </div>

                  <div className={styles.relationSectionGroupBlue}>
                    <span className={styles.relationSectionSubTitle}>{char.name || 'Character'} ➔ {targetName}</span>
                    <div className={styles.relationDescriptionArea}>
                      <AutoGrowingTextArea
                        className={styles.textBlockInput}
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
                              <div className={styles.gaugeTrackWrapper}>
                                {min < 0 && max > 0 && (
                                  <div className={styles.gaugeZeroMarker} style={{ left: `${(Math.abs(min) / (max - min)) * 100}%` }} />
                                )}
                                <div className={styles.gaugeFill} style={{ left, width, backgroundColor: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className={styles.relationSectionGroupRed}>
                    <span className={styles.relationSectionSubTitle}>{targetName} ➔ {char.name || 'Character'}</span>
                    <div className={styles.relationDescriptionArea}>
                      <AutoGrowingTextArea
                        className={styles.textBlockInput}
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
                              <div className={styles.gaugeTrackWrapper}>
                                {min < 0 && max > 0 && (
                                  <div className={styles.gaugeZeroMarker} style={{ left: `${(Math.abs(min) / (max - min)) * 100}%` }} />
                                )}
                                <div className={styles.gaugeFill} style={{ left, width, backgroundColor: color }} />
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
    </div>
  );
}