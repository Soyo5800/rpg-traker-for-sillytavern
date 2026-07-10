import React from 'react';
import styles from './StatusComponent.module.css';
import { LockIcon } from '../Icons';
import { useRPG } from '../core/RPGControl';
import { AutoGrowingTextArea } from '../utils';

export default function StatusComponent({ char, characters = [], activeTabs, onOpenEditor }) {
  const { patchCharacterField } = useRPG();

  const profile = char.profile || { race: '', height: '', hair: '', eye: '', personality: '' };
  const relations = char.relations || {};

  return (
    <div className={styles.tabContentStack}>

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
                      {targetName} {isTargetExist ? '(Synced)' : ''}
                    </strong>
                    <div className={styles.flexCenterGap}>
                      <LockIcon
                        isLocked={data.isLocked}
                        onClick={() => patchCharacterField(char.id, ['relations', targetName, 'isLocked'], !data.isLocked)}
                        className={`${styles.lockIcon} ${data.isLocked ? styles.lockIconActive : ''}`}
                      />
                    </div>
                  </div>

                  <div className={styles.relationSectionMyPerspective}>
                    <span className={styles.relationSectionSubTitle}>{char.name || 'Character'} to {targetName}</span>
                    <div className={styles.relationDescriptionArea}>
                      <div className={`${styles.textBlockInput} ${styles.readOnlyBlock}`}>
                        {data.text || <span className={styles.emptyPlaceholderInline}>No description defined.</span>}
                      </div>
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
                                  <span className={styles.readOnlyNumberValue}>{m.value}</span>
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

                  <div className={styles.relationSectionTargetPerspective}>
                    <span className={styles.relationSectionSubTitle}>{targetName} to {char.name || 'Character'}</span>
                    <div className={styles.relationDescriptionArea}>
                      <div className={`${styles.textBlockInput} ${styles.readOnlyBlock}`}>
                        {targetText || <span className={styles.emptyPlaceholderInline}>No description defined.</span>}
                      </div>
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
                                  <span className={styles.readOnlyNumberValue}>{m.value}</span>
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