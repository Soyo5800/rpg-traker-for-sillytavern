import React, { useRef, useState, useEffect } from 'react';
import { useRPG } from '../core/RPGControl';
import styles from './WorldSection.module.css';

function AutoGrowingTextArea({ value, onChange, placeholder, className }) {
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
      className={className || styles.eventDescTextarea}
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
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      rows={1}
    />
  );
}

export default function WorldSection() {
  const { trackerData, updateTrackerData } = useRPG();
  const worldState = trackerData.worldState || { date: '', time: '', location: '', weather: '', events: [] };
  const events = Array.isArray(worldState.events) ? worldState.events : [];
  
  const guidePrompts = trackerData.guidePrompts || [];
  const isEnabled = (id) => {
    const guide = guidePrompts.find(g => g.id === id);
    return guide ? guide.enabled : true;
  };
  
  // Safe extraction to prevent [object Object] rendering and handle non-string values gracefully
  const safeStr = (val) => {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return '';
    const str = String(val);
    if (str === '[object Object]') return '';
    return str;
  };

  const handleUpdate = (updates) => {
    if (updateTrackerData) {
      updateTrackerData({
        ...trackerData,
        worldState: { ...worldState, ...updates }
      });
    }
  };

  const handleAddEvent = () => {
    const newEvent = { id: `event_${Date.now()}`, name: '', desc: '' };
    handleUpdate({ events: [...events, newEvent] });
  };

  const handleEventChange = (index, key, value) => {
    const newEvents = [...events];
    // Legacy support for string events
    if (typeof newEvents[index] === 'string') {
      newEvents[index] = { id: `event_${Date.now()}`, name: '', desc: newEvents[index] };
    }
    
    newEvents[index] = { ...newEvents[index], [key]: value };
    handleUpdate({ events: newEvents });
  };

  const handleDeleteEvent = (index) => {
    const newEvents = events.filter((_, i) => i !== index);
    handleUpdate({ events: newEvents });
  };

  return (
    <div className={styles.container}>
      
      {/* World State Section */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>World State</span>
        </div>
        
        <div className={styles.stateGrid}>
          {isEnabled('world_date') && (
            <div className={styles.rowField}>
              <span className={styles.fieldLabel}>Date</span>
              <input 
                type="text" 
                className={styles.textInput} 
                value={safeStr(worldState.date)} 
                onChange={(e) => handleUpdate({ date: e.target.value })}
                placeholder="" 
              />
            </div>
          )}

          {isEnabled('world_time') && (
            <div className={styles.rowField}>
              <span className={styles.fieldLabel}>Time</span>
              <input 
                type="text" 
                className={styles.textInput} 
                value={safeStr(worldState.time)} 
                onChange={(e) => handleUpdate({ time: e.target.value })}
                placeholder="" 
              />
            </div>
          )}

          {isEnabled('world_weather') && (
            <div className={styles.rowField}>
              <span className={styles.fieldLabel}>Weather</span>
              <input 
                type="text" 
                className={styles.textInput} 
                value={safeStr(worldState.weather)} 
                onChange={(e) => handleUpdate({ weather: e.target.value })}
                placeholder="" 
              />
            </div>
          )}

          {isEnabled('world_location') && (
            <div className={styles.rowField}>
              <span className={styles.fieldLabel}>Location</span>
              <input 
                type="text" 
                className={styles.textInput} 
                value={safeStr(worldState.location)} 
                onChange={(e) => handleUpdate({ location: e.target.value })}
                placeholder="" 
              />
            </div>
          )}
        </div>
      </div>

      {/* World Events Section */}
      {isEnabled('world_events') && (
        <div className={styles.eventsSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.eventsSectionTitle}>World Events</span>
            <button type="button" className={styles.addBtn} onClick={handleAddEvent}>
              + Add Event
            </button>
          </div>

          <div className={styles.eventsList}>
          {events.length === 0 ? (
            <p className={styles.emptyPlaceholder}>No recorded events.</p>
          ) : (
            events.map((evt, idx) => {
              // Backward compatibility for simple string events
              const evtObj = typeof evt === 'string' ? { name: '', desc: evt } : evt;
              
              return (
                <div key={evtObj.id || idx} className={styles.eventBlock}>
                  <div className={styles.eventHeaderRow}>
                    <span className={styles.eventNumber}>Event {idx + 1}</span>
                    <button 
                      type="button" 
                      className={styles.removeBtn} 
                      onClick={() => handleDeleteEvent(idx)}
                      title="Remove Event"
                    >
                      ×
                    </button>
                  </div>
                  
                  <input 
                    type="text" 
                    className={styles.eventTitleInput}
                    value={evtObj.name || ''} 
                    onChange={(e) => handleEventChange(idx, 'name', e.target.value)}
                    placeholder="Event Title..." 
                  />
                  
                  <AutoGrowingTextArea 
                    value={evtObj.desc || ''} 
                    onChange={(text) => handleEventChange(idx, 'desc', text)}
                    placeholder="Describe event..."
                  />
                </div>
              );
            })
          )}
          </div>
        </div>
      )}

    </div>
  );
}
